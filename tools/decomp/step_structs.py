"""Generate byte-backed TS classes for decomp structs (src/fr/generated/structs.ts).

Field names/types come from the C parser (step_cdata); offsets, sizes,
signedness and bitfield positions are measured by a host C probe compiled
against the real headers, so the layout matches the game's memory layout.
"""

from __future__ import annotations

import re
import subprocess

from common import BUILD, CPP_DEFINES, DECOMP, GEN_INCLUDE, ROOT
from step_cdata import CParser, tokenize

STRUCTS = [
    "BattlePokemon", "DisableStruct", "ProtectStruct", "SpecialStatus", "SideTimer", "WishFutureKnock",
    "BattleScripting", "AI_ThinkingStruct", "BattleHistory", "BattleResults", "BattleStruct",
    "BattleSpriteInfo", "BattleAnimationInfo", "BattleHealthboxInfo", "BattleBarInfo", "UsedMoves",
    "ResourceFlags", "StatsArray", "PokedudeBattlerState", "LinkBattlerHeader", "BattleEnigmaBerry",
    "MultiBattlePokemonTx", "ChooseMoveStruct", "BattleMove",
]
HEADERS = ["global.h", "battle.h", "pokemon.h", "battle_controllers.h", "battle_ai_script_commands.h", "battle_gfx_sfx_util.h"]
SCALARS = {1: ("u8", "s8"), 2: ("u16", "s16"), 4: ("u32", "s32")}


def preprocess_headers() -> str:
    src = BUILD / "structs_probe_hdr.c"
    src.write_text("".join(f'#include "{h}"\n' for h in HEADERS))
    r = subprocess.run(["clang", "-E", "-P", "-x", "c", "-U__APPLE__", "-w", *CPP_DEFINES, "-I", str(BUILD), "-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", str(src)], cwd=DECOMP, capture_output=True)
    return r.stdout.decode()


def field_decls(struct_text_tokens):
    pass


def main_probe(structs: dict[str, list[tuple[str, str | None, bool]]]) -> str:
    lines = ['#include <stdio.h>', '#include <string.h>', '#include <stddef.h>']
    lines += [f'#include "{h}"' for h in HEADERS]
    lines.append("int main(void){")
    for name in STRUCTS:
        if name not in structs:
            continue
        lines.append(f'{{ struct {name} s; printf("S {name} %d\\n", (int)sizeof(s));')
        for field, sub, _arr in structs[name]:
            # bitfield detection: sizeof on a bitfield is illegal, so we
            # always use the fill trick, which also works for plain fields.
            lines.append(f'''  {{ unsigned char *p = (unsigned char *)&s; memset(&s, 0, sizeof s);
    __typeof__(s.{field}) *probe_unused; (void)probe_unused; }}''')
        lines.append("}")
    lines.append("return 0;}")
    return "\n".join(lines)


def build_probe(structs: dict[str, list[tuple[str, str | None, bool]]], bitfields: set[tuple[str, str]], raw: set[tuple[str, str]] = set()) -> str:
    out = ['#include <stdio.h>', '#include <string.h>', '#include <stddef.h>']
    out += [f'#include "{h}"' for h in HEADERS]
    out.append("static void dump(const char *s, const char *f, unsigned char *p, int n){ int i; printf(\"B %s %s\", s, f); for(i=0;i<n;i++) printf(\" %02x\", p[i]); printf(\"\\n\"); }")
    out.append("int main(void){")
    for name in STRUCTS:
        if name not in structs:
            continue
        out.append(f'{{ static struct {name} s; printf("S {name} %d\\n", (int)sizeof(s));')
        for field, sub, arr in structs[name]:
            if (name, field) in raw:
                out.append(f'  printf("R {name} {field} %d %d\\n", (int)offsetof(struct {name}, {field}), (int)sizeof(s.{field}));')
            elif (name, field) in bitfields:
                out.append(f'  memset(&s, 0, sizeof s); s.{field} = -1; dump("{name}", "{field}", (unsigned char *)&s, sizeof s);')
            elif sub:
                out.append(f'  printf("N {name} {field} %d %d {sub}\\n", (int)offsetof(struct {name}, {field}), (int)sizeof(s.{field}));')
            elif arr:
                out.append(f'  printf("A {name} {field} %d %d %d %d\\n", (int)offsetof(struct {name}, {field}), (int)sizeof(s.{field}), (int)sizeof(s.{field}[0]), (int)(((__typeof__(s.{field}[0]))-1) < 0));')
            else:
                out.append(f'  printf("F {name} {field} %d %d %d\\n", (int)offsetof(struct {name}, {field}), (int)sizeof(s.{field}), (int)(((__typeof__(s.{field}))-1) < 0));')
        out.append("}")
    out.append("return 0;}")
    return "\n".join(out)


def compile_run(source: str) -> tuple[bool, str]:
    path = BUILD / "structs_probe.c"
    path.write_text(source)
    exe = BUILD / "structs_probe"
    r = subprocess.run(["clang", "-w", "-x", "c", "-U__APPLE__", *CPP_DEFINES, "-I", str(BUILD), "-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", str(path), "-o", str(exe)], cwd=DECOMP, capture_output=True)
    if r.returncode != 0:
        return False, r.stderr.decode()
    return True, subprocess.run([str(exe)], capture_output=True).stdout.decode()


def export_structs() -> None:
    parser = CParser(tokenize(preprocess_headers()), {})
    parser.parse()
    structs = {n: parser.structs[n] for n in STRUCTS if n in parser.structs}
    missing = [n for n in STRUCTS if n not in parser.structs]
    bitfields: set[tuple[str, str]] = set()
    # Iterate: compile errors on offsetof/sizeof identify bitfields or
    # unsupported fields; mark bitfields and retry.
    dropped: set[tuple[str, str]] = set()
    for _ in range(200):
        filtered = {n: [f for f in fs if (n, f[0]) not in dropped] for n, fs in structs.items()}
        ok, out = compile_run(build_probe(filtered, bitfields))
        if ok:
            break
        lines = build_probe(filtered, bitfields).split("\n")
        changed = False
        errors: dict[tuple[str, str], list[str]] = {}
        for m in re.finditer(r"structs_probe\.c:(\d+):\d+: error: (.*)", out):
            line = lines[int(m.group(1)) - 1]
            fm = re.search(r'"([A-Za-z_]\w*)", "?([A-Za-z_]\w*)', line) or re.search(r"[FNA] (\w+) (\w+)", line)
            if fm:
                errors.setdefault((fm.group(1), fm.group(2)), []).append(m.group(2))
        for key, msgs in errors.items():
            if key not in bitfields and any("bit-field" in x for x in msgs):
                bitfields.add(key)
                changed = True
            elif key not in dropped:
                dropped.add(key)
                changed = True
        if not changed:
            raise RuntimeError(out[:4000])
    if dropped:
        ok2, out2 = compile_run(build_probe(structs, bitfields, dropped))
        if ok2:
            out = out2
            dropped = set()
    sizes: dict[str, int] = {}
    fields: dict[str, list[dict]] = {n: [] for n in STRUCTS}
    for line in out.splitlines():
        parts = line.split()
        if parts[0] == "S":
            sizes[parts[1]] = int(parts[2])
        elif parts[0] == "F":
            fields[parts[1]].append({"kind": "scalar", "name": parts[2], "offset": int(parts[3]), "size": int(parts[4]), "signed": parts[5] == "1"})
        elif parts[0] == "A":
            fields[parts[1]].append({"kind": "array", "name": parts[2], "offset": int(parts[3]), "size": int(parts[4]), "elem": int(parts[5]), "signed": parts[6] == "1"})
        elif parts[0] == "N":
            fields[parts[1]].append({"kind": "struct", "name": parts[2], "offset": int(parts[3]), "size": int(parts[4]), "type": parts[5]})
        elif parts[0] == "R":
            fields[parts[1]].append({"kind": "raw", "name": parts[2], "offset": int(parts[3]), "size": int(parts[4])})
        elif parts[0] == "B":
            bits = [int(x, 16) for x in parts[3:]]
            first = next(i for i, b in enumerate(bits) if b)
            last = max(i for i, b in enumerate(bits) if b)
            value = 0
            for i in range(first, last + 1):
                value |= bits[i] << (8 * (i - first))
            shift = (value & -value).bit_length() - 1
            width = bin(value).count("1")
            fields[parts[1]].append({"kind": "bits", "name": parts[2], "offset": first, "shift": shift, "width": width})
    ts = ["// Generated by tools/decomp/step_structs.py from the decompilation headers. Do not edit.",
          'import { ByteStruct } from "../battle/ram";', ""]
    for name in STRUCTS:
        if name not in sizes:
            continue
        ts.append(f"/** struct {name} ({sizes[name]:#x} bytes) */")
        ts.append(f"export class {name} extends ByteStruct {{")
        ts.append(f"  static readonly SIZE = {sizes[name]};")
        for f in fields[name]:
            n = f["name"]
            if f["kind"] == "scalar" and f["size"] in SCALARS:
                kind = SCALARS[f["size"]][1 if f["signed"] else 0]
                getter = {"u8": "this.bytes[{o}]", "s8": "this.view.getInt8({o})", "u16": "this.view.getUint16({o}, true)", "s16": "this.view.getInt16({o}, true)", "u32": "this.view.getUint32({o}, true)", "s32": "this.view.getInt32({o}, true)"}[kind].format(o=f["offset"])
                setter = {"u8": "this.bytes[{o}] = v & 0xff", "s8": "this.bytes[{o}] = v & 0xff", "u16": "this.view.setUint16({o}, v & 0xffff, true)", "s16": "this.view.setUint16({o}, v & 0xffff, true)", "u32": "this.view.setUint32({o}, v >>> 0, true)", "s32": "this.view.setUint32({o}, v >>> 0, true)"}[kind].format(o=f["offset"])
                ts.append(f"  get {n}(): number {{ return {getter}; }}")
                ts.append(f"  set {n}(v: number) {{ {setter}; }}")
            elif f["kind"] == "bits":
                ts.append(f"  get {n}(): number {{ return this.getBitsAt({f['offset']}, {f['shift']}, {f['width']}); }}")
                ts.append(f"  set {n}(v: number) {{ this.setBitsAt({f['offset']}, {f['shift']}, {f['width']}, v); }}")
            elif f["kind"] == "array":
                count = f["size"] // max(1, f["elem"])
                arr = {(1, False): "Uint8Array", (1, True): "Int8Array", (2, False): "Uint16Array", (2, True): "Int16Array", (4, False): "Uint32Array", (4, True): "Int32Array"}.get((f["elem"], f["signed"]))
                if arr and f["offset"] % f["elem"] == 0:
                    ts.append(f"  get {n}(): {arr} {{ return new {arr}(this.bytes.buffer, this.bytes.byteOffset + {f['offset']}, {count}); }}")
                else:
                    ts.append(f"  get {n}(): Uint8Array {{ return this.bytes.subarray({f['offset']}, {f['offset'] + f['size']}); }}")
            elif f["kind"] == "struct" and f["type"] in sizes:
                ts.append(f"  get {n}(): {f['type']} {{ return new {f['type']}(this.bytes.subarray({f['offset']}, {f['offset'] + f['size']})); }}")
            else:
                ts.append(f"  /** raw bytes */ get {n}(): Uint8Array {{ return this.bytes.subarray({f['offset']}, {f['offset'] + f['size']}); }}")
        ts.append("}")
        ts.append("")
    (ROOT / "src" / "fr" / "generated" / "structs.ts").write_text("\n".join(ts))
    print(f"  structs: {len(sizes)} generated, missing {missing}, dropped {sorted(dropped)}")
