#!/usr/bin/env python3
"""Export the Gen 4 species table of pokeplatinum.

Output: refs/platinum/species.json, a list indexed by species id from
generated/species.txt (SPECIES_NONE = 0, SPECIES_BAD_EGG = 495). Each entry
keeps the non-graphical battle, breeding, evolution, and learnset fields from
res/pokemon/<name>/data.json.

Usage: npm run refs:platinum-species  (needs `npm run refs:fetch -- pokeplatinum`)
"""

from __future__ import annotations

import json

from common import source_path, write_output

FIELDS = (
    "base_stats",
    "types",
    "abilities",
    "catch_rate",
    "ev_yields",
    "gender_ratio",
    "hatch_cycles",
    "base_friendship",
    "exp_rate",
    "egg_groups",
    "held_items",
    "evolutions",
    "learnset",
)
EXPECTED_SPECIES = 496


def main() -> None:
    src = source_path("pokeplatinum")
    names = [line.strip() for line in (src / "generated/species.txt").read_text().splitlines() if line.strip()]
    if len(names) != EXPECTED_SPECIES:
        raise SystemExit(f"generated/species.txt: expected {EXPECTED_SPECIES} species, found {len(names)}")
    if names[0] != "SPECIES_NONE" or names[-2:] != ["SPECIES_EGG", "SPECIES_BAD_EGG"]:
        raise SystemExit("generated/species.txt: unexpected sentinel species ordering")

    species = []
    for species_id, const in enumerate(names):
        path = src / "res/pokemon" / const.removeprefix("SPECIES_").lower() / "data.json"
        if not path.exists():
            raise SystemExit(f"{const}: missing {path}")
        data = json.loads(path.read_text())
        missing = [field for field in FIELDS if field not in data]
        if missing:
            raise SystemExit(f"{const}: missing fields in {path}: {', '.join(missing)}")
        species.append({"id": species_id, "const": const, **{field: data[field] for field in FIELDS}})

    write_output("platinum", "species.json", species, "pokeplatinum", "tools/refs/platinum_species.py")
    print(f"{len(species)} species")


if __name__ == "__main__":
    main()
