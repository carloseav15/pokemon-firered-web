#!/usr/bin/env python3
"""Export the Gen 4 move table of pokeplatinum.

Output: refs/platinum/moves.json, a list indexed by move id (generated/moves.txt
order, MOVE_NONE = 0). Each entry keeps the battle fields of
res/moves/<name>/data.json; descriptions and contest data are left out.
Move ids 1-354 match FireRed's (same national move numbering).

Usage: npm run refs:platinum-moves   (needs `npm run refs:fetch -- pokeplatinum`)
"""

from __future__ import annotations

import json

from common import source_path, write_output

FIELDS = ("name", "class", "type", "power", "accuracy", "pp", "range", "priority", "flags")


def main() -> None:
    src = source_path("pokeplatinum")
    names = [l.strip() for l in (src / "generated/moves.txt").read_text().splitlines() if l.strip()]
    moves = []
    for move_id, const in enumerate(n for n in names if n != "MAX_MOVES"):
        path = src / "res/moves" / const.removeprefix("MOVE_").lower() / "data.json"
        if not path.exists():
            raise SystemExit(f"{const}: missing {path}")
        data = json.loads(path.read_text())
        entry = {"id": move_id, "const": const, **{k: data[k] for k in FIELDS}}
        entry["effect"] = data["effect"]["type"]
        entry["effect_chance"] = data["effect"]["chance"]
        moves.append(entry)
    write_output("platinum", "moves.json", moves, "pokeplatinum", "tools/refs/platinum_moves.py")
    print(f"{len(moves)} moves")


if __name__ == "__main__":
    main()
