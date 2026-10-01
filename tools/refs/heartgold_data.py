#!/usr/bin/env python3
"""Extract HeartGold trainer and encounter tables from pinned source JSON.

Outputs refs/heartgold/trainers.json and encounters.json. Source constants,
messages, and table shapes are retained as represented in pokeheartgold.

Usage: npm run refs:heartgold-data (needs the pinned pokeheartgold checkout).
"""

from __future__ import annotations

import json
from pathlib import Path

from common import source_path, write_output

EXPECTED_TRAINERS = 738
EXPECTED_ENCOUNTERS = 142
TRAINER_FIELDS = ("type", "class", "name", "items", "ai_flags", "double", "party", "messages")


def read_table(path: Path, key: str, expected: int) -> list[dict]:
    if not path.is_file():
        raise SystemExit(f"missing source data: {path}")
    try:
        document = json.loads(path.read_text(encoding="utf8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"invalid JSON in {path}: {error}") from None
    if not isinstance(document, dict) or key not in document:
        raise SystemExit(f"{path}: expected top-level {key!r}")
    entries = document[key]
    if not isinstance(entries, list):
        raise SystemExit(f"{path}: {key} must be a list")
    if len(entries) != expected:
        raise SystemExit(f"{path}: expected {expected} {key}, found {len(entries)}")
    if not all(isinstance(entry, dict) for entry in entries):
        raise SystemExit(f"{path}: {key} contains a non-object entry")
    return entries


def main() -> None:
    source = source_path("pokeheartgold") / "files"
    trainers = read_table(source / "poketool/trainer/trainers.json", "trainers", EXPECTED_TRAINERS)
    for index, trainer in enumerate(trainers):
        missing = [field for field in TRAINER_FIELDS if field not in trainer]
        if missing:
            raise SystemExit(f"trainer index {index}: missing fields {missing}")
        if not isinstance(trainer["party"], list) or not isinstance(trainer["messages"], list):
            raise SystemExit(f"trainer index {index}: party/messages must be lists")

    encounters = read_table(source / "fielddata/encountdata/gs_enc_data.json", "encounters", EXPECTED_ENCOUNTERS)
    maps = [encounter.get("map") for encounter in encounters]
    if not all(isinstance(map_name, str) and map_name for map_name in maps):
        raise SystemExit("gs_enc_data.json: every encounter needs a non-empty map name")
    if len(set(maps)) != len(maps):
        raise SystemExit("gs_enc_data.json: duplicate map entries")

    write_output("heartgold", "trainers.json", trainers, "pokeheartgold", "tools/refs/heartgold_data.py")
    write_output("heartgold", "encounters.json", encounters, "pokeheartgold", "tools/refs/heartgold_data.py")
    print(f"{len(trainers)} trainers ({sum(bool(row['party']) for row in trainers)} with parties)")
    print(f"{len(encounters)} encounter maps")


if __name__ == "__main__":
    main()
