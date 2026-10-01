#!/usr/bin/env python3
"""Extract Emerald trainer definitions and their party data.

Reads src/data/trainers.h and src/data/trainer_parties.h from the pinned
pokeemerald checkout. Constants remain symbolic strings.

Output: refs/emerald/trainers.json. Usage: npm run refs:emerald-trainers.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import source_path, write_output  # noqa: E402


PARTY_MACROS = {
    "NO_ITEM_DEFAULT_MOVES": "NoItemDefaultMoves",
    "NO_ITEM_CUSTOM_MOVES": "NoItemCustomMoves",
    "ITEM_DEFAULT_MOVES": "ItemDefaultMoves",
    "ITEM_CUSTOM_MOVES": "ItemCustomMoves",
}


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
    raise SystemExit(f"unclosed initializer at byte {opening}")


def fields(body: str) -> dict[str, str]:
    out = {}
    for match in re.finditer(r"\.([A-Za-z_][A-Za-z_0-9]*)\s*=", body):
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
        out[match.group(1)] = body[start:end].strip()
    return out


def constants(value: str) -> list[str]:
    return re.findall(r"\b[A-Z][A-Z0-9_]*\b", value)


def read_parties(text: str) -> dict[str, list[dict]]:
    text = strip_comments(text)
    pattern = re.compile(r"static\s+const\s+struct\s+TrainerMon([A-Za-z]+)\s+(sParty_[A-Za-z0-9_]+)\[\]\s*=\s*\{")
    parties = {}
    for match in pattern.finditer(text):
        kind, name = match.groups()
        body, end = brace_body(text, match.end() - 1)
        mons = []
        for entry in re.finditer(r"\{", body):
            mon_body, _ = brace_body(body, entry.start())
            f = fields(mon_body)
            if not f:
                continue
            if not all(key in f for key in ("iv", "lvl", "species")):
                raise SystemExit(f"{name}: incomplete party member: {f}")
            mon = {"iv": f["iv"], "lvl": f["lvl"], "species": f["species"]}
            if kind.startswith("Item"):
                if "heldItem" not in f:
                    raise SystemExit(f"{name}: missing heldItem")
                mon["held_item"] = f["heldItem"]
            if "CustomMoves" in kind:
                if "moves" not in f:
                    raise SystemExit(f"{name}: missing moves")
                mon["moves"] = constants(f["moves"])
            mons.append(mon)
        if name in parties:
            raise SystemExit(f"duplicate party definition: {name}")
        parties[name] = mons
    return parties


def read_trainers(text: str, parties: dict[str, list[dict]]) -> list[dict]:
    text = strip_comments(text)
    start = text.find("gTrainers[]")
    if start < 0:
        raise SystemExit("trainers.h: gTrainers[] not found")
    array_open = text.find("{", start)
    array_body, _ = brace_body(text, array_open)
    entries = []
    pattern = re.compile(r"\[(TRAINER_[A-Z0-9_]+)\]\s*=\s*\{")
    for match in pattern.finditer(array_body):
        body, _ = brace_body(array_body, match.end() - 1)
        f = fields(body)
        const = match.group(1)
        party_expr = f.get("party", "")
        macro = re.fullmatch(r"([A-Z_]+)\s*\(\s*(sParty_[A-Za-z0-9_]+)\s*\)", party_expr)
        if macro:
            party_type, party_name = macro.groups()
            if party_type not in PARTY_MACROS:
                raise SystemExit(f"{const}: unsupported party macro {party_type}")
            if party_name not in parties:
                raise SystemExit(f"{const}: party {party_name} is not defined")
            party = parties[party_name]
        elif const == "TRAINER_NONE" and ".NoItemDefaultMoves = NULL" in party_expr:
            party_type, party = "NONE", []
        else:
            raise SystemExit(f"{const}: unsupported party initializer {party_expr!r}")
        name_match = re.fullmatch(r'_\("((?:[^"\\]|\\.)*)"\)', f.get("trainerName", ""))
        required = ("trainerClass", "trainerPic", "encounterMusic_gender", "items", "doubleBattle", "aiFlags")
        missing = [key for key in required if key not in f]
        if missing and const != "TRAINER_NONE":
            raise SystemExit(f"{const}: missing fields {missing}")
        entries.append({
            "const": const,
            "class": f.get("trainerClass", "TRAINER_CLASS_PKMN_TRAINER_1"),
            "name": name_match.group(1) if name_match else "",
            "pic": f.get("trainerPic", "TRAINER_PIC_HIKER"),
            "music_gender": f.get("encounterMusic_gender", "TRAINER_ENCOUNTER_MUSIC_MALE"),
            "items": constants(f.get("items", "")),
            "double": f.get("doubleBattle", "FALSE"),
            "ai_flags": constants(f.get("aiFlags", "0")),
            "party_type": party_type,
            "party": party,
        })
    return entries


def main() -> None:
    src = source_path("pokeemerald") / "src/data"
    parties = read_parties((src / "trainer_parties.h").read_text())
    trainers = read_trainers((src / "trainers.h").read_text(), parties)
    if len(trainers) != 855:
        raise SystemExit(f"expected 855 trainers, found {len(trainers)}")
    with_party = sum(bool(t["party"]) for t in trainers)
    if with_party != 854:
        raise SystemExit(f"expected 854 trainers with parties, found {with_party}")
    by_const = {t["const"]: t for t in trainers}
    sawyer = by_const.get("TRAINER_SAWYER_1")
    expected_sawyer = {"class": "TRAINER_CLASS_HIKER", "name": "SAWYER", "party": [{"iv": "0", "lvl": "21", "species": "SPECIES_GEODUDE"}]}
    if not sawyer or any(sawyer[k] != v for k, v in expected_sawyer.items()):
        raise SystemExit(f"TRAINER_SAWYER_1 mismatch: {sawyer}")
    randall = by_const.get("TRAINER_RANDALL")
    expected_randall = {"party_type": "ITEM_CUSTOM_MOVES", "party": [{"iv": "255", "lvl": "26", "species": "SPECIES_SWELLOW", "held_item": "ITEM_NONE", "moves": ["MOVE_QUICK_ATTACK", "MOVE_AGILITY", "MOVE_WING_ATTACK", "MOVE_NONE"]}]}
    if not randall or any(randall[k] != v for k, v in expected_randall.items()):
        raise SystemExit(f"TRAINER_RANDALL mismatch: {randall}")
    write_output("emerald", "trainers.json", trainers, "pokeemerald", "tools/refs/emerald_trainers.py")
    print(f"{len(trainers)} trainers, {with_party} with parties, {len(parties)} party definitions")


if __name__ == "__main__":
    main()
