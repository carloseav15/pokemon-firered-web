"""Assemble the battle, battle AI and battle animation scripts.

Battle scripts touch RAM through `symbol + offset` operands (for example
`gBattleCommunication + 1`), so external symbols are encoded as
EXTERN_BASE + (index << 12) + addend.
"""

from __future__ import annotations

import re
import struct

from common import BUILD, OUT, write_json
from step_scripts import EXTERN_BASE, PRELUDE, ROM_BASE, assemble_source, link_section, preprocess

EXTERN_SHIFT = 12


def strip_header(source: str) -> str:
    """Drop macro definitions inlined by preproc and helper symbol definitions."""
    out = []
    in_inc = False
    for line in source.split("\n"):
        marker = re.match(r'\s*# \d+ "([^"]+)"', line)
        if marker:
            in_inc = marker.group(1).endswith(".inc")
            continue
        if in_inc:
            continue
        if re.match(r"^\s*\.set (NULL|FALSE|TRUE), [01]\s*$", line):
            continue
        out.append(line)
    return "\n".join(out)


def build(files: list[str], obj_name: str):
    parts = [PRELUDE, ".set NULL, 0\n.set FALSE, 0\n.set TRUE, 1\n"]
    for index, path in enumerate(files):
        source = preprocess(path)
        # Keep the first file's inlined macros, strip them from the others.
        parts.append(source if index == 0 else strip_header(source))
        if index == 0:
            parts[-1] = re.sub(r"^\s*\.set (NULL|FALSE|TRUE), [01]\s*$", "", parts[-1], flags=re.M)
    elf = assemble_source("\n".join(parts), obj_name)
    return link_section(elf, "script_data", EXTERN_SHIFT)


def table(blob: bytes, labels: dict[str, int], label: str, end: int | None = None) -> list[int]:
    out = []
    offset = labels[label]
    while end is None or offset < end:
        value = struct.unpack_from("<I", blob, offset)[0]
        if value < ROM_BASE or value >= EXTERN_BASE:
            break
        out.append(value)
        offset += 4
    return out


def export_battle_scripts(constants: dict[str, int]) -> None:
    blob, labels, externals = build(["data/battle_scripts_1.s", "data/battle_scripts_2.s"], "battle_scripts")
    (OUT / "battle").mkdir(parents=True, exist_ok=True)
    (OUT / "battle" / "scripts.bin").write_bytes(blob)
    write_json(OUT / "battle" / "scripts.json", {"base": ROM_BASE, "externBase": EXTERN_BASE, "externShift": EXTERN_SHIFT, "labels": labels, "externals": externals})
    print(f"  battle scripts: {len(blob)} bytes, {len(labels)} labels, {len(externals)} externals")

    blob, labels, externals = build(["data/battle_ai_scripts.s"], "battle_ai_scripts")
    (OUT / "battle" / "ai.bin").write_bytes(blob)
    write_json(OUT / "battle" / "ai.json", {"base": ROM_BASE, "externBase": EXTERN_BASE, "externShift": EXTERN_SHIFT, "labels": labels, "externals": externals})
    print(f"  battle AI scripts: {len(blob)} bytes, {len(labels)} labels, {len(externals)} externals")

    blob, labels, externals = build(["data/battle_anim_scripts.s"], "battle_anim_scripts")
    (OUT / "battle" / "anims.bin").write_bytes(blob)
    write_json(OUT / "battle" / "anims.json", {"base": ROM_BASE, "externBase": EXTERN_BASE, "externShift": EXTERN_SHIFT, "labels": labels, "externals": externals})
    print(f"  battle anim scripts: {len(blob)} bytes, {len(labels)} labels, {len(externals)} externals")
