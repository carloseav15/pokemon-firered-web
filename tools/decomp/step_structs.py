"""Generate byte-backed TS classes for decomp structs (src/fr/generated/structs.ts).

Field names/types come from the C parser (step_cdata); offsets, sizes,
signedness and bitfield positions come from Clang's ARMv4T record-layout dump.
Do not execute a host probe: host pointers have the wrong ABI.
"""

from __future__ import annotations

import re
import subprocess

from common import BUILD, CPP_DEFINES, DECOMP, GEN_INCLUDE, GENERATED, ROOT
from step_cdata import CParser, tokenize

STRUCTS = [
    "BattlePokemon", "DisableStruct", "ProtectStruct", "SpecialStatus", "SideTimer", "WishFutureKnock",
    "BattleScripting", "AI_ThinkingStruct", "BattleHistory", "BattleResults", "BattleStruct",
    "BattleSpriteInfo", "BattleAnimationInfo", "BattleHealthboxInfo", "BattleBarInfo", "UsedMoves",
    "ResourceFlags", "StatsArray", "PokedudeBattlerState", "LinkBattlerHeader", "BattleEnigmaBerry",
    "MultiBattlePokemonTx", "ChooseMoveStruct", "BattleMove",
    "Berry", "Berry2", "EnigmaBerry",
]
HEADERS = ["global.h", "battle.h", "pokemon.h", "battle_controllers.h", "battle_ai_script_commands.h", "battle_gfx_sfx_util.h"]
SCALARS = {1: ("u8", "s8"), 2: ("u16", "s16"), 4: ("u32", "s32")}
SCALAR_ALIASES = {"bool8": (1, False), "bool16": (2, False), "bool32": (4, False)}
TARGET = "armv4t-none-eabi"


def preprocess_headers() -> str:
    src = BUILD / "structs_probe_hdr.c"
    src.write_text("".join(f'#include "{h}"\n' for h in HEADERS))
    r = subprocess.run(["clang", "-E", "-P", "-x", "c", "-U__APPLE__", "-w", *CPP_DEFINES, "-I", str(BUILD), "-I", str(GEN_INCLUDE), "-iquote", "include", "-I", "include", str(src)], cwd=DECOMP, capture_output=True)
    return r.stdout.decode()


def target_layouts(preprocessed: str, structs: dict[str, list[tuple[str, str | None, bool]]]) -> tuple[dict[str, int], dict[str, list[dict]]]:
    """Measure selected C structs using Clang's target ABI layout dump."""
    BUILD.mkdir(parents=True, exist_ok=True)
    path = BUILD / "structs_layout.c"
    declarations = "\n".join(f"struct {name} codex_layout_{name};" for name in STRUCTS if name in structs)
    path.write_text(preprocessed + "\n" + declarations + "\n")
    result = subprocess.run(
        ["clang", f"--target={TARGET}", "-Xclang", "-fdump-record-layouts-complete", "-fsyntax-only", "-w", "-x", "c", str(path)],
        cwd=DECOMP, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Clang {TARGET} layout dump failed:\n{result.stderr[:4000]}")

    dump = result.stdout + result.stderr
    layouts: dict[str, tuple[int, dict[str, dict]]] = {}
    blocks = re.split(r"\*\*\* Dumping AST Record Layout\n", dump)
    for block in blocks:
        header = re.search(r"^\s*0 \| struct (\w+)\s*$", block, re.M)
        trailer = re.search(r"\[sizeof=(\d+), align=(\d+)\]", block)
        if not header or not trailer:
            continue
        name = header.group(1)
        if name not in structs:
            continue
        parsed: dict[str, dict] = {}
        for line in block.splitlines():
            row = re.match(r"^\s*(\d+)(?::(\d+)-(\d+))? \|([ ]+)(.*?)\s*$", line)
            # Top-level record fields have exactly three spaces after '|';
            # deeper indentation is Clang expanding a nested struct member.
            if not row or len(row.group(4)) != 3:
                continue
            field_type = row.group(5)
            field_name = re.search(r"([A-Za-z_]\w*)$", field_type)
            if not field_name:
                continue
            parsed[field_name.group(1)] = {
                "offset": int(row.group(1)),
                "bitStart": int(row.group(2)) if row.group(2) is not None else None,
                "bitEnd": int(row.group(3)) if row.group(3) is not None else None,
                "type": field_type[:field_name.start()].strip(),
            }
        layouts[name] = (int(trailer.group(1)), parsed)

    missing = [name for name in structs if name not in layouts]
    if missing:
        raise RuntimeError(f"Clang {TARGET} did not report layouts for: {missing}")

    sizes = {name: layout[0] for name, layout in layouts.items()}
    fields: dict[str, list[dict]] = {}
    for name, decls in structs.items():
        parsed = layouts[name][1]
        generated: list[dict] = []
        for field_index, (field, sub, arr) in enumerate(decls):
            layout = parsed.get(field)
            if layout is None:
                raise RuntimeError(f"Clang {TARGET} layout for {name}.{field} was not found")
            offset, bit_start, bit_end, field_type = layout["offset"], layout["bitStart"], layout["bitEnd"], layout["type"]
            next_field = parsed.get(decls[field_index + 1][0]) if field_index + 1 < len(decls) else None
            raw_size = (next_field["offset"] if next_field else sizes[name]) - offset
            if bit_start is not None:
                generated.append({"kind": "bits", "name": field, "offset": offset, "shift": bit_start, "width": bit_end - bit_start + 1})
            elif field_type.startswith("struct "):
                nested = field_type.removeprefix("struct ").strip()
                if nested not in sizes:
                    generated.append({"kind": "raw", "name": field, "offset": offset, "size": raw_size})
                else:
                    generated.append({"kind": "struct", "name": field, "offset": offset, "size": sizes[nested], "type": nested})
            elif field_type.startswith("union "):
                generated.append({"kind": "raw", "name": field, "offset": offset, "size": raw_size})
            elif "[" in field_type:
                array = re.match(r"^(.+?)((?:\[\d+\])+)$", field_type)
                if not array:
                    raise RuntimeError(f"Clang {TARGET} array type not recognized: {name}.{field}: {field_type}")
                elem_name = array.group(1).strip()
                count = 1
                for dim in re.findall(r"\[(\d+)\]", array.group(2)):
                    count *= int(dim)
                if "*" in elem_name:
                    elem_size, signed = 4, False
                else:
                    elem_size, signed = next(((n, t.startswith("s")) for n, types in SCALARS.items() for t in types if t == elem_name), SCALAR_ALIASES.get(elem_name, (0, False)))
                if not elem_size and elem_name.startswith("struct "):
                    elem_size, signed = sizes.get(elem_name.removeprefix("struct "), 0), False
                if not elem_size:
                    generated.append({"kind": "raw", "name": field, "offset": offset, "size": raw_size})
                    continue
                generated.append({"kind": "array", "name": field, "offset": offset, "size": elem_size * count, "elem": elem_size, "signed": signed})
            elif "*" in field_type:
                generated.append({"kind": "raw", "name": field, "offset": offset, "size": 4})
            else:
                scalar = field_type.strip()
                scalar_size, signed = next(((n, scalar.startswith("s")) for n, types in SCALARS.items() for t in types if t == scalar), SCALAR_ALIASES.get(scalar, (0, False)))
                if not scalar_size:
                    generated.append({"kind": "raw", "name": field, "offset": offset, "size": raw_size})
                else:
                    generated.append({"kind": "scalar", "name": field, "offset": offset, "size": scalar_size, "signed": signed})
        fields[name] = generated
    return sizes, fields


def export_structs() -> None:
    preprocessed = preprocess_headers()
    parser = CParser(tokenize(preprocessed), {})
    parser.parse()
    structs = {n: parser.structs[n] for n in STRUCTS if n in parser.structs}
    missing = [n for n in STRUCTS if n not in parser.structs]
    sizes, fields = target_layouts(preprocessed, structs)
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
    GENERATED.mkdir(parents=True, exist_ok=True)
    (GENERATED / "structs.ts").write_text("\n".join(ts))
    print(f"  structs: {len(sizes)} generated for {TARGET}, missing {missing}")
