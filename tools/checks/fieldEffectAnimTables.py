#!/usr/bin/env python3
"""Compare exported field-effect animation tables with their C declarations."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/decomp"))

from common import DECOMP, OUT, read_json  # noqa: E402
from step_objects import parse_anim_cmds, parse_anim_tables, parse_define_values, strip_comments  # noqa: E402


source = strip_comments((DECOMP / "src/data/field_effects/field_effect_objects.h").read_text())
indices = parse_define_values(DECOMP / "include/constants/global.h", "DIR_")
commands = parse_anim_cmds(source)
tables = parse_anim_tables(source, indices)

for _name, body in re.findall(r"const union AnimCmd \*const (\w+)\[\]\s*=\s*\{(.*?)\};", source, flags=re.S):
    for expression in re.findall(r"\[([^\]]+)\]\s*=", body):
        for key in re.findall(r"\b[A-Za-z_]\w*\b", expression):
            assert key in indices, f"Unmapped C animation index {key} in {_name}"

fieldfx = read_json(OUT / "fieldfx.json")
templates = {}
for name, body in re.findall(r"const struct SpriteTemplate (gFieldEffectObjectTemplate_\w+)\s*=\s*\{(.*?)\};", source, flags=re.S):
    fields = dict(re.findall(r"\.(\w+)\s*=\s*([^,\n]+)", body))
    table = fields.get("anims", "").strip()
    if table not in tables:
        continue
    template_name = name.removeprefix("gFieldEffectObjectTemplate_")
    refs = [entry for entry in tables[table] if entry]
    missing = [entry for entry in refs if entry not in commands]
    assert not missing, f"Missing C animation arrays for {template_name}: {missing}"
    expected = [commands[entry] for entry in refs]
    actual = fieldfx["templates"][template_name]["anims"]
    assert actual == expected, f"Exported animation table differs from C for {template_name}"

try:
    parse_anim_tables(
        "const union AnimCmd *const sUnsupported[] = { [DIR_UNKNOWN] = sAnim };",
        indices,
    )
except ValueError as error:
    assert "Unsupported animation index" in str(error)
else:
    raise AssertionError("Unknown animation index was not rejected")

print("Field effect animation tables match C declarations")
