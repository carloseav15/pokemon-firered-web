#!/usr/bin/env python3
"""Compare Emerald species and move data with FireRed's generated JSON.

The comparison reports source constants that resolve to FireRed's numeric
values as representation, and only labels unequal normalized values real.
Outputs refs/emerald/species_vs_firered.json and moves_vs_firered.json.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import portInventory as P  # noqa: E402
from common import ROOT, source_path, write_output  # noqa: E402

SPECIES_FIELDS = (
    "stats", "types", "abilities", "egg_groups", "catch_rate",
)
MOVE_FIELDS = ("type", "power", "accuracy", "pp", "priority", "effect_chance")


def defines(path: Path, prefix: str) -> dict[str, int]:
    if not path.is_file():
        raise SystemExit(f"constants file not found: {path}")
    pattern = re.compile(rf"^#define\s+({prefix}[A-Z0-9_]*)\s+(-?(?:0x[0-9A-Fa-f]+|\d+))\s*$", re.M)
    return {name: int(value, 0) for name, value in pattern.findall(path.read_text())}


def resolve(value, tables: dict[str, dict[str, int]], context: str):
    if isinstance(value, int):
        return value
    if not isinstance(value, str):
        raise SystemExit(f"{context}: unsupported value {value!r}")
    if value.startswith("PERCENT_FEMALE(") and value.endswith(")"):
        try:
            percent = float(value[len("PERCENT_FEMALE("):-1])
        except ValueError:
            raise SystemExit(f"{context}: invalid gender ratio {value!r}") from None
        return min(254, int(percent * 255 / 100))
    for table in tables.values():
        if value in table:
            return table[value]
    raise SystemExit(f"{context}: unmapped C constant {value!r}")


def normalized_species(species: dict, tables: dict[str, dict[str, int]]) -> dict:
    const = species["const"]
    return {
        "stats": species["base_stats"],
        "types": [resolve(x, tables, f"{const}.types") for x in species["types"]],
        "abilities": [resolve(x, tables, f"{const}.abilities") for x in species["abilities"]],
        "egg_groups": [resolve(x, tables, f"{const}.egg_groups") for x in species["egg_groups"]],
        "catch_rate": species["catch_rate"],
    }


def species_differences() -> tuple[list[dict], Counter, Counter]:
    emerald = json.loads((ROOT / "refs/emerald/species.json").read_text())["data"]
    firered = json.loads((ROOT / "public/fr/data/species.json").read_text())["species"]
    if len(emerald) != 412 or len(firered) != 412:
        raise SystemExit(f"expected 412 species in both datasets, found Emerald={len(emerald)} FireRed={len(firered)}")

    emerald_constants = source_path("pokeemerald") / "include/constants"
    firered_constants = P.DECOMP / "include/constants"
    firered_type_ids = defines(firered_constants / "pokemon.h", "TYPE_")
    firered_ability_ids = defines(firered_constants / "abilities.h", "ABILITY_")
    firered_egg_ids = defines(firered_constants / "pokemon.h", "EGG_GROUP_")
    tables = {
        "type": defines(emerald_constants / "pokemon.h", "TYPE_"),
        "ability": defines(emerald_constants / "abilities.h", "ABILITY_"),
        "egg": defines(emerald_constants / "pokemon.h", "EGG_GROUP_"),
    }
    fr_by_id = {index: row for index, row in enumerate(firered)}
    out = []
    kinds: Counter[str] = Counter()
    kind_fields: Counter[tuple[str, str]] = Counter()
    for p in emerald:
        sid = p["id"]
        if sid not in fr_by_id or sid != p["id"]:
            raise SystemExit(f"{p['const']}: no matching FireRed species index {sid}")
        f = fr_by_id[sid]
        ev = normalized_species(p, tables)
        for field, allowed in (
            ("types", set(firered_type_ids.values())),
            ("abilities", set(firered_ability_ids.values())),
            ("eggGroups", set(firered_egg_ids.values())),
        ):
            for value in f[field]:
                if value not in allowed:
                    raise SystemExit(f"FireRed species {sid}: {field} id {value} absent from {P.DECOMP}")
        fv = {
            "stats": f["base"], "types": f["types"], "abilities": f["abilities"],
            "egg_groups": f["eggGroups"], "catch_rate": f["catchRate"],
        }
        raw = {
            "stats": p["base_stats"], "types": p["types"], "abilities": p["abilities"],
            "egg_groups": p["egg_groups"], "catch_rate": p["catch_rate"],
        }
        changes = {}
        for field in SPECIES_FIELDS:
            if fv[field] == ev[field]:
                continue
            kind = "real"
            changes[field] = {"values": [fv[field], raw[field]], "kind": kind}
            kinds[kind] += 1
            kind_fields[(kind, field)] += 1
        if changes:
            out.append({"id": sid, "const": p["const"], "cambios": changes})
    return out, kinds, kind_fields


def move_differences() -> tuple[list[dict], Counter, Counter]:
    emerald = json.loads((ROOT / "refs/emerald/moves.json").read_text())["data"]
    firered = json.loads((ROOT / "public/fr/data/moves.json").read_text())["moves"]
    if len(emerald) != 355 or len(firered) != 355:
        raise SystemExit(f"expected 355 moves in both datasets, found Emerald={len(emerald)} FireRed={len(firered)}")
    type_ids = defines(source_path("pokeemerald") / "include/constants/pokemon.h", "TYPE_")
    out = []
    kinds: Counter[str] = Counter()
    kind_fields: Counter[tuple[str, str]] = Counter()
    for move_id in range(1, 355):
        p, f = emerald[move_id], firered[move_id]
        if p["id"] != move_id or f.get("id", move_id) != move_id:
            raise SystemExit(f"move index mismatch at {move_id}: Emerald={p.get('id')} FireRed={f.get('id')}")
        values = {
            "type": resolve(p["type"], {"types": type_ids}, f"{p['const']}.type"),
            "power": p["power"], "accuracy": p["accuracy"], "pp": p["pp"],
            "priority": p["priority"], "effect_chance": p["effect_chance"],
        }
        firered_values = {
            "type": f["type"], "power": f["power"], "accuracy": f["accuracy"],
            "pp": f["pp"], "priority": f["priority"], "effect_chance": f["chance"],
        }
        raw = {**values, "type": p["type"]}
        changes = {}
        for field in MOVE_FIELDS:
            comparable_emerald = values[field]
            # Resolve C constants before comparison: equal type ids are not data
            # differences merely because Emerald spells the type symbolically.
            if comparable_emerald == firered_values[field]:
                continue
            kind = "real"
            changes[field] = {"values": [firered_values[field], raw[field]], "kind": kind}
            kinds[kind] += 1
            kind_fields[(kind, field)] += 1
        if changes:
            out.append({"id": move_id, "const": p["const"], "cambios": changes})
    return out, kinds, kind_fields


def report(label: str, differences: list[dict], kinds: Counter, kind_fields: Counter, fields: tuple[str, ...]) -> None:
    print(f"{label}: {kinds['real']} real differences; {len(differences)} entries differ; {sum(kinds.values())} field differences")
    for kind in ("real", "representation"):
        print(f"  {kind}: {kinds[kind]}")
        for field in fields:
            if kind_fields[(kind, field)]:
                print(f"    {field}: {kind_fields[(kind, field)]}")


def main() -> None:
    species, species_kinds, species_fields = species_differences()
    moves, move_kinds, move_fields = move_differences()
    write_output("emerald", "species_vs_firered.json", species, "pokeemerald", "tools/refs/compare_emerald.py")
    write_output("emerald", "moves_vs_firered.json", moves, "pokeemerald", "tools/refs/compare_emerald.py")
    report("species", species, species_kinds, species_fields, SPECIES_FIELDS)
    report("moves", moves, move_kinds, move_fields, MOVE_FIELDS)


if __name__ == "__main__":
    main()
