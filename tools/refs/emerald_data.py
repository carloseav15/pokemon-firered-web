#!/usr/bin/env python3
"""Extract Emerald's species and battle move tables from pinned C sources.

Outputs refs/emerald/species.json and moves.json. C constants are retained as
text so the tables preserve their source representation.

Usage: npm run refs:emerald-data (needs the pinned pokeemerald checkout).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from common import source_path, write_output

EXPECTED_SPECIES = 412
EXPECTED_MOVES = 355
SPECIES_FIELDS = (
    "baseHP", "baseAttack", "baseDefense", "baseSpeed", "baseSpAttack", "baseSpDefense",
    "types", "catchRate", "expYield", "evYield_HP", "evYield_Attack", "evYield_Defense",
    "evYield_Speed", "evYield_SpAttack", "evYield_SpDefense", "itemCommon", "itemRare",
    "genderRatio", "eggCycles", "friendship", "growthRate", "eggGroups", "abilities",
    "safariZoneFleeRate", "bodyColor", "noFlip",
)


def strip_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.S)


def brace_body(text: str, opening: int) -> tuple[str, int]:
    depth = 0
    for i in range(opening, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[opening + 1:i], i + 1
    raise SystemExit(f"unclosed C initializer at byte {opening}")


def designated_entries(text: str, prefix: str):
    pattern = re.compile(rf"\[({prefix}[A-Z0-9_]+)\]\s*=\s*")
    for match in pattern.finditer(text):
        start = match.end()
        if start < len(text) and text[start] == "{":
            body, end = brace_body(text, start)
            yield match.group(1), body.strip(), end
        else:
            end = text.find(",", start)
            if end < 0:
                raise SystemExit(f"{match.group(1)}: missing initializer terminator")
            yield match.group(1), text[start:end].strip(), end + 1


def parse_fields(body: str) -> dict[str, str]:
    result = {}
    pattern = re.compile(r"\.([A-Za-z_][A-Za-z_0-9]*)\s*=")
    for match in pattern.finditer(body):
        start = match.end()
        end = start
        depth = 0
        while end < len(body):
            char = body[end]
            if char in "({[":
                depth += 1
            elif char in ")}]":
                depth -= 1
            elif char == "," and depth == 0:
                break
            end += 1
        result[match.group(1)] = body[start:end].strip()
    return result


def scalar(raw: str):
    raw = raw.strip()
    if re.fullmatch(r"-?(?:0[xX][0-9a-fA-F]+|\d+)", raw):
        return int(raw, 0)
    if raw == "TRUE":
        return 1
    if raw == "FALSE":
        return 0
    return raw


def array(raw: str) -> list:
    raw = raw.strip()
    if not (raw.startswith("{") and raw.endswith("}")):
        raise SystemExit(f"expected C array initializer, got {raw!r}")
    return [scalar(value) for value in raw[1:-1].split(",") if value.strip()]


def old_unown_macro(text: str) -> str:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if re.match(r"^#define\s+OLD_UNOWN_SPECIES_INFO\b", line):
            chunks = [re.sub(r"^#define\s+OLD_UNOWN_SPECIES_INFO\s*", "", line).rstrip()]
            while chunks[-1].endswith("\\"):
                chunks[-1] = chunks[-1][:-1].rstrip()
                index += 1
                if index >= len(lines):
                    raise SystemExit("species_info.h: unterminated OLD_UNOWN_SPECIES_INFO macro")
                chunks.append(lines[index].strip())
            return " ".join(chunks).strip()
    raise SystemExit("species_info.h: OLD_UNOWN_SPECIES_INFO macro not found")


def read_species(src: Path) -> list[dict]:
    path = src / "src/data/pokemon/species_info.h"
    text = strip_comments(path.read_text())
    constants = {
        name: int(value, 0)
        for name, value in re.findall(r"^#define\s+(SPECIES_[A-Z0-9_]+)\s+(0x[0-9A-Fa-f]+|\d+)\s*$", (src / "include/constants/species.h").read_text(), re.M)
    }
    macros = {"OLD_UNOWN_SPECIES_INFO": old_unown_macro(text)}
    entries = {}
    for const, body, _ in designated_entries(text, "SPECIES_"):
        if const not in constants:
            raise SystemExit(f"species_info.h: no numeric id for {const}")
        if const in entries:
            raise SystemExit(f"species_info.h: duplicate initializer {const}")
        if body == "0":
            if const != "SPECIES_NONE":
                raise SystemExit(f"{const}: unexpected zero initializer")
            f = {}
        elif body in macros:
            macro = macros[body]
            opening = macro.find("{")
            macro_body, _ = brace_body(macro, opening)
            f = parse_fields(macro_body)
        else:
            f = parse_fields(body)

        missing = [name for name in SPECIES_FIELDS if name not in f]
        if missing and const != "SPECIES_NONE":
            raise SystemExit(f"{const}: missing species fields {missing}")

        def get(name: str, default=0):
            return scalar(f[name]) if name in f else default

        def get_array(name: str, default):
            return array(f[name]) if name in f else default

        fields = {
            "base_stats": [get(k) for k in ("baseHP", "baseAttack", "baseDefense", "baseSpeed", "baseSpAttack", "baseSpDefense")],
            "types": get_array("types", [0, 0]),
            "catch_rate": get("catchRate"),
            "exp_yield": get("expYield"),
            "ev_yields": [get(k) for k in ("evYield_HP", "evYield_Attack", "evYield_Defense", "evYield_Speed", "evYield_SpAttack", "evYield_SpDefense")],
            "items": [get("itemCommon"), get("itemRare")],
            "gender_ratio": get("genderRatio"),
            "egg_cycles": get("eggCycles"),
            "friendship": get("friendship"),
            "growth_rate": get("growthRate"),
            "egg_groups": get_array("eggGroups", [0, 0]),
            "abilities": get_array("abilities", [0, 0]),
            "safari_flee_rate": get("safariZoneFleeRate"),
            "body_color": get("bodyColor"),
            "no_flip": get("noFlip"),
        }
        if len(fields["types"]) != 2 or len(fields["egg_groups"]) != 2 or len(fields["abilities"]) != 2:
            raise SystemExit(f"{const}: unexpected pair field shape")
        entries[constants[const]] = {"id": constants[const], "const": const, **fields}
    if len(entries) != EXPECTED_SPECIES:
        raise SystemExit(f"{path}: expected {EXPECTED_SPECIES} entries, found {len(entries)}")
    return [entries[key] for key in sorted(entries)]


def read_moves(src: Path) -> list[dict]:
    path = src / "src/data/battle_moves.h"
    text = strip_comments(path.read_text())
    constant_text = (src / "include/constants/moves.h").read_text()
    ids = {
        name: int(value, 0)
        for name, value in re.findall(r"^#define\s+(MOVE_[A-Z0-9_]+)\s+(0x[0-9A-Fa-f]+|\d+)\s*$", constant_text, re.M)
    }
    entries = {}
    for const, body, _ in designated_entries(text, "MOVE_"):
        if const not in ids:
            raise SystemExit(f"battle_moves.h: no numeric id for {const}")
        if body == "{0}" or body == "0":
            f = {}
        else:
            f = parse_fields(body)
        required = ("effect", "power", "type", "accuracy", "pp", "secondaryEffectChance", "target", "priority", "flags")
        missing = [name for name in required if name not in f]
        if missing:
            raise SystemExit(f"{const}: missing fields {missing}")
        flags = [] if f["flags"] == "0" else re.findall(r"\b[A-Z][A-Z0-9_]*\b", f["flags"])
        row = {
            "id": ids[const], "const": const,
            "effect": scalar(f["effect"]), "power": scalar(f["power"]),
            "type": scalar(f["type"]), "accuracy": scalar(f["accuracy"]),
            "pp": scalar(f["pp"]), "effect_chance": scalar(f["secondaryEffectChance"]),
            "target": scalar(f["target"]), "priority": scalar(f["priority"]),
            "flags": flags,
        }
        if row["id"] in entries:
            raise SystemExit(f"battle_moves.h: duplicate move id {row['id']} ({const})")
        entries[row["id"]] = row
    if len(entries) != EXPECTED_MOVES:
        raise SystemExit(f"{path}: expected {EXPECTED_MOVES} entries, found {len(entries)}")
    return [entries[key] for key in sorted(entries)]


def main() -> None:
    src = source_path("pokeemerald")
    species = read_species(src)
    moves = read_moves(src)
    write_output("emerald", "species.json", species, "pokeemerald", "tools/refs/emerald_data.py")
    write_output("emerald", "moves.json", moves, "pokeemerald", "tools/refs/emerald_data.py")
    print(f"{len(species)} species and {len(moves)} moves")


if __name__ == "__main__":
    main()
