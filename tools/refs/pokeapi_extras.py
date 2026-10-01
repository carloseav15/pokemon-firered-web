#!/usr/bin/env python3
"""Extract Spanish names and Mega Pokémon from the pinned PokéAPI CSVs.

PokéAPI is a secondary reference, not a source of truth. Names are filtered to
local_language_id=7; Mega records join pokemon.csv with stats, types, and
abilities by pokemon_id.

Outputs refs/pokeapi/names_es.json and megas.json.
Usage: npm run refs:pokeapi-extras (needs the pinned pokeapi checkout).
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

from common import source_path, write_output

SPANISH = "7"
EXPECTED_NAMES = {
    "pokemon_species_names": 1025,
    "move_names": 937,
    "item_names": 2219,
    "ability_names": 311,
}
EXPECTED_MEGAS = 97


def rows(csv_dir: Path, filename: str) -> list[dict[str, str]]:
    path = csv_dir / filename
    if not path.is_file():
        raise SystemExit(f"missing PokéAPI CSV: {path}")
    with path.open(newline="", encoding="utf8") as stream:
        return list(csv.DictReader(stream))


def integer(value: str, context: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise SystemExit(f"{context}: expected integer, got {value!r}") from None


def optional_integer(value: str, context: str) -> int | None:
    return None if value == "" else integer(value, context)


def spanish_names(csv_dir: Path) -> dict[str, list[dict]]:
    definitions = {
        "pokemon_species": ("pokemon_species_names", "pokemon_species_id", ("genus",)),
        "moves": ("move_names", "move_id", ()),
        "items": ("item_names", "item_id", ()),
        "abilities": ("ability_names", "ability_id", ()),
    }
    result = {}
    for output_key, (filename, id_field, extra_fields) in definitions.items():
        selected = [row for row in rows(csv_dir, f"{filename}.csv") if row["local_language_id"] == SPANISH]
        expected = EXPECTED_NAMES[filename]
        if len(selected) != expected:
            raise SystemExit(f"{filename}.csv: expected {expected} Spanish rows, found {len(selected)}")
        result[output_key] = [
            {"id": integer(row[id_field], f"{filename}.{id_field}"),
             "name": row["name"],
             **{field: row[field] for field in extra_fields}}
            for row in sorted(selected, key=lambda row: integer(row[id_field], f"{filename}.{id_field}"))
        ]
    return result


def mega_data(csv_dir: Path) -> list[dict]:
    pokemon = [row for row in rows(csv_dir, "pokemon.csv") if "-mega" in row["identifier"]]
    if len(pokemon) != EXPECTED_MEGAS:
        raise SystemExit(f"pokemon.csv: expected {EXPECTED_MEGAS} Mega forms, found {len(pokemon)}")
    before = sum(integer(row["id"], "pokemon.id") < 10100 for row in pokemon)
    later = len(pokemon) - before
    mega_z = sum("-mega-z" in row["identifier"] for row in pokemon)
    if (before, later, mega_z) != (48, 49, 3):
        raise SystemExit(f"Mega form groups changed: id<10100={before}, id>=10100={later}, mega-z={mega_z}")

    stats: dict[int, list[dict]] = defaultdict(list)
    for row in rows(csv_dir, "pokemon_stats.csv"):
        stats[integer(row["pokemon_id"], "pokemon_stats.pokemon_id")].append({
            "stat_id": integer(row["stat_id"], "pokemon_stats.stat_id"),
            "base_stat": integer(row["base_stat"], "pokemon_stats.base_stat"),
            "effort": integer(row["effort"], "pokemon_stats.effort"),
        })

    types: dict[int, list[dict]] = defaultdict(list)
    for row in rows(csv_dir, "pokemon_types.csv"):
        types[integer(row["pokemon_id"], "pokemon_types.pokemon_id")].append({
            "slot": integer(row["slot"], "pokemon_types.slot"),
            "type_id": integer(row["type_id"], "pokemon_types.type_id"),
        })

    abilities: dict[int, list[dict]] = defaultdict(list)
    for row in rows(csv_dir, "pokemon_abilities.csv"):
        abilities[integer(row["pokemon_id"], "pokemon_abilities.pokemon_id")].append({
            "slot": integer(row["slot"], "pokemon_abilities.slot"),
            "ability_id": integer(row["ability_id"], "pokemon_abilities.ability_id"),
            "is_hidden": row["is_hidden"] == "1",
        })

    result = []
    for row in sorted(pokemon, key=lambda value: integer(value["id"], "pokemon.id")):
        pokemon_id = integer(row["id"], "pokemon.id")
        if pokemon_id not in stats or len(stats[pokemon_id]) != 6:
            raise SystemExit(f"{row['identifier']}: expected six base stats")
        if pokemon_id not in types or not types[pokemon_id]:
            raise SystemExit(f"{row['identifier']}: missing type rows")
        result.append({
            "id": pokemon_id,
            "identifier": row["identifier"],
            "species_id": integer(row["species_id"], f"{row['identifier']}.species_id"),
            "height": integer(row["height"], f"{row['identifier']}.height"),
            "weight": integer(row["weight"], f"{row['identifier']}.weight"),
            "base_experience": optional_integer(row["base_experience"], f"{row['identifier']}.base_experience"),
            "order": optional_integer(row["order"], f"{row['identifier']}.order"),
            "is_default": row["is_default"] == "1",
            "stats": sorted(stats[pokemon_id], key=lambda value: value["stat_id"]),
            "types": sorted(types[pokemon_id], key=lambda value: value["slot"]),
            "abilities": sorted(abilities[pokemon_id], key=lambda value: value["slot"]),
        })
    return result


def main() -> None:
    csv_dir = source_path("pokeapi") / "data/v2/csv"
    names = spanish_names(csv_dir)
    megas = mega_data(csv_dir)
    write_output("pokeapi", "names_es.json", names, "pokeapi", "tools/refs/pokeapi_extras.py")
    write_output("pokeapi", "megas.json", megas, "pokeapi", "tools/refs/pokeapi_extras.py")
    print("Spanish names: " + ", ".join(f"{key}={len(value)}" for key, value in names.items()))
    print(f"Mega Pokémon: {len(megas)} (id<10100={sum(row['id'] < 10100 for row in megas)}, id>=10100={sum(row['id'] >= 10100 for row in megas)}, mega-z={sum('-mega-z' in row['identifier'] for row in megas)})")


if __name__ == "__main__":
    main()
