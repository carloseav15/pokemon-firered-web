"""Shared helpers for exporting pokefirered data to the web port.

All steps read the sibling decompilation and write browser data to
public/fr. Build intermediates (host tools, generated headers) live in
.decomp-build so the decompilation tree is never modified.
"""

from __future__ import annotations

import json
import os
import re
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DECOMP = Path(os.environ.get("POKEFIRERED", ROOT.parent / "pokefirered")).resolve()
BUILD = ROOT / ".decomp-build"
BIN = BUILD / "bin"
GEN_INCLUDE = BUILD / "include"
OUT = ROOT / "public" / "fr"

CPP_DEFINES = ["-DFIRERED", "-DREVISION=0", "-DENGLISH", "-DMODERN=0"]


def run(cmd: list[str], *, cwd: Path | None = None, stdin: bytes | None = None, quiet: bool = False) -> bytes:
    result = subprocess.run(cmd, cwd=cwd or DECOMP, input=stdin, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(map(str, cmd))}\n{result.stderr.decode(errors='replace')[:4000]}")
    if result.stderr and not quiet:
        pass
    return result.stdout


def write_json(path: Path, value, *, compact: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        path.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False))
    else:
        path.write_text(json.dumps(value, indent=1, ensure_ascii=False))


def read_json(path: Path):
    return json.loads(path.read_text())


def snake(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


# ---------------------------------------------------------------- charmap

_CHARMAP: dict[int, str] | None = None


def charmap_decode_table() -> dict[int, str]:
    """Byte -> printable character for plain (single byte) glyphs."""
    global _CHARMAP
    if _CHARMAP is not None:
        return _CHARMAP
    table: dict[int, str] = {}
    for line in (DECOMP / "charmap.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("@")[0].strip()
        match = re.match(r"^'(.+)'\s*=\s*([0-9A-Fa-f]{2})$", line)
        if not match:
            continue
        char, code = match.group(1), int(match.group(2), 16)
        if char.startswith("\\"):
            continue
        table.setdefault(code, char)
    table[0x00] = " "
    _CHARMAP = table
    return table


def decode_gba_string(data: bytes | list[int]) -> str:
    """Decode a GBA string for names/labels (control codes are dropped)."""
    table = charmap_decode_table()
    out = []
    i = 0
    data = bytes(data)
    while i < len(data):
        b = data[i]
        if b == 0xFF:
            break
        if b == 0xFC:
            i += 2
            continue
        if b == 0xFD:
            i += 2
            continue
        if b == 0xFE:
            out.append("\n")
        elif b == 0x53 and i + 1 < len(data) and data[i + 1] == 0x54:
            out.append("PKMN")
            i += 1
        else:
            out.append(table.get(b, "?"))
        i += 1
    return "".join(out)


# ---------------------------------------------------------------- graphics

def read_jasc_palette(path: Path) -> list[list[int]]:
    lines = path.read_text().split()
    if lines[0] != "JASC-PAL":
        raise ValueError(f"{path} is not a JASC palette")
    count = int(lines[2])
    values = list(map(int, lines[3:3 + count * 3]))
    return [[values[i * 3] & 0xF8, values[i * 3 + 1] & 0xF8, values[i * 3 + 2] & 0xF8] for i in range(count)]


def png_indices(path: Path):
    """Return (width, height, indices bytes, palette rgb list) for an indexed PNG."""
    from PIL import Image

    image = Image.open(path)
    if image.mode not in ("P", "L", "1"):
        raise ValueError(f"{path} is not an indexed PNG ({image.mode})")
    if image.mode != "P":
        image = image.convert("P")
    raw_palette = image.getpalette() or []
    palette = [raw_palette[i:i + 3] for i in range(0, len(raw_palette), 3)]
    return image.width, image.height, image.tobytes(), palette


def to_4bpp_tiles(width: int, height: int, indices: bytes) -> bytes:
    """Convert an indexed image into GBA 4bpp tile order (8x8 tiles, row-major)."""
    out = bytearray()
    for ty in range(height // 8):
        for tx in range(width // 8):
            for y in range(8):
                row = (ty * 8 + y) * width + tx * 8
                for x in range(0, 8, 2):
                    lo = indices[row + x] & 0xF
                    hi = indices[row + x + 1] & 0xF
                    out.append(lo | (hi << 4))
    return bytes(out)


def rgba_png(path_in: Path, path_out: Path, palette: list[list[int]] | None = None, transparent_index: int | None = 0) -> tuple[int, int]:
    """Write an RGBA PNG from an indexed PNG using `palette` (defaults to the embedded one)."""
    from PIL import Image

    width, height, indices, embedded = png_indices(path_in)
    pal = palette or embedded
    image = Image.new("RGBA", (width, height))
    pixels = []
    for index in indices:
        if transparent_index is not None and index == transparent_index:
            pixels.append((0, 0, 0, 0))
        else:
            color = pal[index] if index < len(pal) else [255, 0, 255]
            pixels.append((color[0] & 0xF8, color[1] & 0xF8, color[2] & 0xF8, 255))
    image.putdata(pixels)
    path_out.parent.mkdir(parents=True, exist_ok=True)
    image.save(path_out, optimize=True)
    return width, height


# ---------------------------------------------------------------- ELF

class Elf32:
    def __init__(self, data: bytes):
        self.data = data
        (self.shoff,) = struct.unpack_from("<I", data, 0x20)
        self.shentsize, self.shnum, self.shstrndx = struct.unpack_from("<HHH", data, 0x2E)
        self.sections = []
        for i in range(self.shnum):
            fields = struct.unpack_from("<IIIIIIIIII", data, self.shoff + i * self.shentsize)
            self.sections.append({
                "name_off": fields[0], "type": fields[1], "offset": fields[4], "size": fields[5],
                "link": fields[6], "info": fields[7], "entsize": fields[9],
            })
        shstr = self.sections[self.shstrndx]
        for section in self.sections:
            section["name"] = self._cstr(shstr["offset"] + section["name_off"])

    def _cstr(self, offset: int) -> str:
        end = self.data.index(b"\0", offset)
        return self.data[offset:end].decode()

    def section(self, name: str):
        for index, section in enumerate(self.sections):
            if section["name"] == name:
                return index, section
        raise KeyError(name)

    def bytes_of(self, name: str) -> bytes:
        _, section = self.section(name)
        return self.data[section["offset"]:section["offset"] + section["size"]]

    def symbols(self):
        _, symtab = self.section(".symtab")
        strtab = self.sections[symtab["link"]]
        result = []
        for i in range(symtab["size"] // 16):
            name_off, value, size, info, other, shndx = struct.unpack_from("<IIIBBH", self.data, symtab["offset"] + i * 16)
            name = self._cstr(strtab["offset"] + name_off) if name_off else ""
            result.append({"name": name, "value": value, "size": size, "type": info & 0xF, "bind": info >> 4, "shndx": shndx})
        return result

    def relocations(self, name: str):
        _, section = self.section(name)
        result = []
        for i in range(section["size"] // 8):
            offset, info = struct.unpack_from("<II", self.data, section["offset"] + i * 8)
            result.append((offset, info >> 8, info & 0xFF))
        return result
