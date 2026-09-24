"""Export every INCBIN'd binary (graphics, palettes, tilemaps...) by symbol.

Each C file is run through the C preprocessor with the build's defines so
version conditionals (#if FIRERED / LEAFGREEN) resolve exactly as in the real
build. The referenced files are produced with the decompilation's own gbagfx
tool, following the pattern and explicit rules of the Makefiles
(graphics_file_rules.mk, spritesheet_rules.mk, tileset_rules.mk). Compressed
variants (.lz / .rl) are stored uncompressed, since the web runtime does not
need the GBA's decompression step.

Output: public/fr/incbin/<pack>.bin plus public/fr/incbin/index.json mapping
"file.c:symbol" (and the bare symbol when unambiguous) to [pack, offset, size].
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

from common import BIN, BUILD, CPP_DEFINES, DECOMP, GEN_INCLUDE, OUT, run, write_json

GFX_OUT = BUILD / "gfx"
RULE_FILES = ["graphics_file_rules.mk", "spritesheet_rules.mk", "tileset_rules.mk"]
INCBIN_MACROS = ("INCBIN", "INCBIN_U8", "INCBIN_U16", "INCBIN_U32", "INCBIN_S8", "INCBIN_S16", "INCBIN_S32")


# ---------------------------------------------------------------- make rules

class Rules:
    def __init__(self) -> None:
        self.vars: dict[str, str] = {}
        self.rules: dict[str, tuple[list[str], list[str]]] = {}
        for name in RULE_FILES:
            path = DECOMP / name
            if path.exists():
                self.parse(path.read_text())

    def expand(self, text: str) -> str:
        return re.sub(r"\$\((\w+)\)", lambda m: self.vars.get(m.group(1), m.group(0)), text)

    def parse(self, text: str) -> None:
        text = text.replace("\\\n", " ")
        lines = text.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i]
            i += 1
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            m = re.match(r"^(\w+)\s*:?=\s*(.*)$", line)
            if m:
                self.vars[m.group(1)] = self.expand(m.group(2).strip())
                continue
            if line.startswith("\t"):
                continue
            if ":" not in line:
                continue
            recipe = []
            while i < len(lines) and lines[i].startswith("\t"):
                recipe.append(lines[i].strip())
                i += 1
            parts = [p.strip() for p in self.expand(line).split(":")]
            targets = parts[0].split()
            if len(parts) == 3:
                # static pattern rule: targets: %.a: %.b
                target_pattern, dep_pattern = parts[1], parts[2]
                for target in targets:
                    stem = match_pattern(target_pattern, target)
                    deps = [d.replace("%", stem) for d in dep_pattern.split()] if stem is not None else []
                    self.rules[target] = (deps, recipe)
            else:
                deps = parts[1].split() if len(parts) > 1 else []
                for target in targets:
                    self.rules[target] = (deps, recipe)


def match_pattern(pattern: str, target: str) -> str | None:
    if "%" not in pattern:
        return None
    prefix, suffix = pattern.split("%", 1)
    if target.startswith(prefix) and target.endswith(suffix):
        return target[len(prefix):len(target) - len(suffix)]
    return None


class Builder:
    def __init__(self) -> None:
        self.rules = Rules()
        self.gbagfx = str(BIN / "gbagfx")
        self.cache: dict[str, bytes] = {}
        self.failed: dict[str, str] = {}

    def out_path(self, rel: str) -> Path:
        return GFX_OUT / rel

    def gfx(self, src: str, dest: str, flags: list[str]) -> None:
        dest_path = self.out_path(dest)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        src_path = src if (DECOMP / src).exists() and not self.is_generated(src) else str(self.materialize(src))
        subprocess.run([self.gbagfx, src_path, str(dest_path), *flags], cwd=DECOMP, check=True, capture_output=True)

    def is_generated(self, rel: str) -> bool:
        return rel.endswith((".1bpp", ".4bpp", ".8bpp", ".gbapal", ".lz", ".rl", "font")) or rel in self.rules.rules

    def materialize(self, rel: str) -> Path:
        """Build `rel` (if needed) and return a path holding its bytes."""
        data = self.build(rel)
        path = self.out_path(rel)
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return path

    def build(self, rel: str) -> bytes:
        if rel in self.cache:
            return self.cache[rel]
        data = self._build(rel)
        self.cache[rel] = data
        return data

    def _build(self, rel: str) -> bytes:
        if rel.endswith((".lz", ".rl")):
            return self.build(rel[:-3])
        rule = self.rules.rules.get(rel)
        if rule and rule[1]:
            deps, recipe = rule
            command = recipe[0].lstrip("@")
            if command.startswith("cat"):
                return b"".join(self.build(d) for d in deps)
            if "$(GFX)" in command or "GFX" in command:
                flags = command.split("$@", 1)[1].split() if "$@" in command else []
                self.gfx(deps[0], rel, flags)
                return self.out_path(rel).read_bytes()
            raise RuntimeError(f"unsupported recipe for {rel}: {command}")
        source = DECOMP / rel
        if source.exists() and not rel.endswith((".1bpp", ".4bpp", ".8bpp", ".gbapal")):
            return source.read_bytes()
        stem, ext = rel.rsplit(".", 1)
        if ext in ("1bpp", "4bpp", "8bpp") or ext.endswith("font"):
            self.gfx(stem + ".png", rel, [])
            return self.out_path(rel).read_bytes()
        if ext == "gbapal":
            src = stem + ".pal" if (DECOMP / (stem + ".pal")).exists() else stem + ".png"
            self.gfx(src, rel, [])
            return self.out_path(rel).read_bytes()
        if source.exists():
            return source.read_bytes()
        raise FileNotFoundError(rel)


# ---------------------------------------------------------------- symbols

INCBIN_RE = re.compile(r"(\w+)\s*(?:\[[^\]]*\]\s*)*=\s*__INCBIN__\s*\(([^)]*)\)")
# Arrays whose initializer is only INCBINs, e.g. gTextWindowPalettes[][16] = { INCBIN(...), ... }
INCBIN_ARRAY_RE = re.compile(r"(\w+)\s*(?:\[[^\]]*\]\s*)+=\s*\{\s*((?:__INCBIN__\s*\([^)]*\)\s*,?\s*)+)\}")


def scan_file(path: Path) -> list[tuple[str, list[str]]]:
    defines = [f"-D{m}(...)=__INCBIN__(__VA_ARGS__)" for m in INCBIN_MACROS]
    include_args = ["-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", "-I", "src", "-I", str(BUILD)]
    result = subprocess.run(["clang", "-E", "-P", "-x", "c", "-U__APPLE__", "-w", *defines, *CPP_DEFINES, *include_args, str(path)], cwd=DECOMP, capture_output=True)
    if result.returncode != 0 and not result.stdout:
        return []
    text = result.stdout.decode("utf-8", errors="replace")
    found = []
    for regex in (INCBIN_RE, INCBIN_ARRAY_RE):
        for m in regex.finditer(text):
            paths = re.findall(r'"([^"]+)"', m.group(2))
            if paths:
                found.append((m.group(1), paths))
    return found


def pack_name(rel: str) -> str:
    parts = rel.split("/")
    if parts[0] == "graphics" and len(parts) > 2:
        if parts[1] == "pokemon":
            return "pokemon"
        return f"graphics_{parts[1]}"
    return parts[0] if len(parts) > 1 else "misc"


def export_incbin() -> None:
    builder = Builder()
    sources = sorted((DECOMP / "src").glob("*.c"))
    symbols: dict[str, list[str]] = {}
    for src in sources:
        for name, paths in scan_file(src):
            symbols.setdefault(f"{src.name}:{name}", paths)
    packs: dict[str, bytearray] = {}
    index: dict[str, list] = {}
    by_path: dict[tuple[str, ...], list] = {}
    for key, paths in sorted(symbols.items()):
        tup = tuple(paths)
        if tup not in by_path:
            try:
                data = b"".join(builder.build(p) for p in paths)
            except Exception as error:  # noqa: BLE001
                builder.failed[key] = f"{paths}: {error}"
                continue
            pack = pack_name(paths[0])
            blob = packs.setdefault(pack, bytearray())
            while len(blob) % 4:
                blob.append(0)
            by_path[tup] = [pack, len(blob), len(data)]
            blob.extend(data)
        index[key] = by_path[tup]
    # Bare names for symbols defined once (or identically) across files.
    bare: dict[str, list] = {}
    ambiguous = set()
    for key, entry in index.items():
        name = key.split(":", 1)[1]
        if name in bare and bare[name] != entry:
            ambiguous.add(name)
        bare.setdefault(name, entry)
    for name, entry in bare.items():
        if name not in ambiguous:
            index[name] = entry
    out = OUT / "incbin"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for pack, blob in packs.items():
        (out / f"{pack}.bin").write_bytes(bytes(blob))
    write_json(out / "index.json", {"packs": {p: len(b) for p, b in packs.items()}, "symbols": index})
    total = sum(len(b) for b in packs.values())
    print(f"  incbin: {len(symbols)} symbols, {len(by_path)} blobs, {len(packs)} packs, {total / 1e6:.1f} MB")
    if builder.failed:
        print(f"  {len(builder.failed)} failed:")
        for key, why in list(builder.failed.items())[:30]:
            print("   ", key, why[:200])
