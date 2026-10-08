"""Assemble data/event_scripts.s into the original script bytecode.

The decompilation's preproc tool encodes strings with charmap.txt, the host
C preprocessor resolves constants, and clang's integrated ARM assembler
expands the event/movement macros. Relocations are resolved into a flat blob
where internal pointers are 0x08000000 + offset and external symbols (C
functions such as ScrCmd_* or specials) are 0x0F000000 + index.
"""

from __future__ import annotations

import re
import struct

from common import BIN, BUILD, DECOMP, EXTRA_INCLUDES, GAME, GEN_INCLUDE, OUT, Elf32, run, write_json

ROM_BASE = 0x08000000
EXTERN_BASE = 0x0F000000

PRELUDE = f"""
.set {GAME.upper()}, 1
.set REVISION, 0
.set ENGLISH, 1
.set MODERN, 0
.set STR_VAR_1, 0x7F01
.set STR_VAR_2, 0x7F02
.set STR_VAR_3, 0x7F03
"""


def gas_to_llvm(source: str) -> str:
    # GAS global labels `Name::` are not understood by LLVM's assembler.
    source = re.sub(r"^([A-Za-z0-9_]+)::", r".global \1\n\1:", source, flags=re.M)
    # trainerbattle_* compare an optional label argument against FALSE. GAS
    # tolerates relocatable operands there; LLVM needs a string comparison.
    source = re.sub(r"\.if \\([a-z_]+) == FALSE", r".ifc \\\1,FALSE", source)
    return source


def preprocess(entry: str) -> str:
    """preproc (charmap strings) -> C preprocessor -> preproc -ie, as the Makefile does."""
    preproc = str(BIN / "preproc")
    stage1 = run([preproc, entry, "charmap.txt"])
    stage2 = run(["clang", "-E", "-x", "assembler-with-cpp", "-P", "-Wno-trigraphs", "-I", str(GEN_INCLUDE), *EXTRA_INCLUDES, "-iquote", "include", "-I", "include", "-"], stdin=stage1)
    stage3 = run([preproc, "-ie", entry, "charmap.txt"], stdin=stage2)
    return gas_to_llvm(stage3.decode("utf-8", errors="replace"))


def assemble_source(source: str, obj_name: str) -> Elf32:
    asm = BUILD / f"{obj_name}.s"
    asm.write_text(source)
    obj = BUILD / f"{obj_name}.o"
    run(["clang", "--target=armv4t-none-eabi", "-c", str(asm), "-o", str(obj)])
    return Elf32(obj.read_bytes())


def assemble(entry: str, obj_name: str) -> Elf32:
    return assemble_source(PRELUDE + preprocess(entry), obj_name)


def link_section(elf: Elf32, section_name: str, extern_shift: int = 0):
    section_index, _ = elf.section(section_name)
    blob = bytearray(elf.bytes_of(section_name))
    symbols = elf.symbols()
    labels: dict[str, int] = {}
    for symbol in symbols:
        if symbol["shndx"] == section_index and symbol["name"] and symbol["type"] != 3:
            labels.setdefault(symbol["name"], symbol["value"])
    externals: list[str] = []
    extern_index: dict[str, int] = {}
    for offset, sym_index, rel_type in elf.relocations(".rel" + section_name):
        symbol = symbols[sym_index]
        addend = struct.unpack_from("<I", blob, offset)[0]
        if rel_type != 2:  # R_ARM_ABS32
            raise RuntimeError(f"unexpected relocation {rel_type} at {offset:#x}")
        if symbol["shndx"] == 0:
            name = symbol["name"]
            if name not in extern_index:
                extern_index[name] = len(externals)
                externals.append(name)
            value = EXTERN_BASE + (extern_index[name] << extern_shift) + addend
        elif symbol["shndx"] == section_index:
            value = ROM_BASE + symbol["value"] + addend
        else:
            raise RuntimeError(f"relocation against foreign section at {offset:#x}")
        struct.pack_into("<I", blob, offset, value)
    return bytes(blob), labels, externals


def read_pointer_table(blob: bytes, labels: dict[str, int], externals: list[str], label: str, count: int | None = None, end_label: str | None = None):
    start = labels[label]
    names = []
    offset = start
    while True:
        if count is not None and len(names) >= count:
            break
        if end_label is not None and offset >= labels[end_label]:
            break
        value = struct.unpack_from("<I", blob, offset)[0]
        if value >= EXTERN_BASE:
            names.append(externals[value - EXTERN_BASE])
        elif value >= ROM_BASE:
            names.append(value)
        else:
            break
        offset += 4
    return names


def export_scripts(constants: dict[str, int]) -> None:
    elf = assemble("data/event_scripts.s", "event_scripts")
    blob, labels, externals = link_section(elf, "script_data")
    commands = read_pointer_table(blob, labels, externals, "gScriptCmdTable", end_label="gScriptCmdTableEnd")
    specials = read_pointer_table(blob, labels, externals, "gSpecials", end_label="gSpecialsEnd") if "gSpecialsEnd" in labels else None
    if specials is None:
        # gSpecials has no end label; its entries are all external functions.
        specials = []
        offset = labels["gSpecials"]
        while True:
            value = struct.unpack_from("<I", blob, offset)[0]
            if value < EXTERN_BASE:
                break
            specials.append(externals[value - EXTERN_BASE])
            offset += 4
    std = []
    offset = labels["gStdScripts"]
    end = labels.get("gStdScriptsEnd", offset + 4 * 10)
    while offset < end:
        std.append(struct.unpack_from("<I", blob, offset)[0])
        offset += 4
    (OUT).mkdir(parents=True, exist_ok=True)
    (OUT / "scripts.bin").write_bytes(blob)
    write_json(OUT / "scripts.json", {
        "base": ROM_BASE,
        "externBase": EXTERN_BASE,
        "labels": labels,
        "externals": externals,
        "commands": [c if isinstance(c, str) else hex(c) for c in commands],
        "specials": specials,
        "std": std,
    })
    print(f"  scripts: {len(blob)} bytes, {len(labels)} labels, {len(commands)} commands, {len(specials)} specials")
