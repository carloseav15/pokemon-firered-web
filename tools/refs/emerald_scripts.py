#!/usr/bin/env python3
"""Summarize Emerald map script labels, specials, flags and vars.

Reads the pinned pokeemerald data/maps scripts.inc files and compares called
special names with the FireRed data/specials.inc table. Writes
refs/emerald/scripts.json.

Usage: npm run refs:emerald-scripts
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from common import ROOT, source_path, write_output


LABEL = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*):{1,2}\s*(?:@.*)?$")
DIRECTIVE = re.compile(r"^\s*(specialvar|special|setflag|clearflag|checkflag|goto_if_set|goto_if_unset|call_if_set|call_if_unset|setvar|compare|copyvar|addvar|subvar|random|goto_if_eq|goto_if_ne|goto_if_lt|goto_if_le|goto_if_gt|goto_if_ge)\s+([^@\s].*?)\s*(?:@.*)?$", re.I)
IDENT = re.compile(r"\b[A-Za-z][A-Za-z0-9_]*\b")


def firered_specials(path: Path) -> set[str]:
    if not path.is_file():
        raise SystemExit(f"missing FireRed specials table: {path}")
    found = set(re.findall(r"^\s*def_special\s+([A-Za-z_][A-Za-z0-9_]*)", path.read_text(encoding="utf8"), re.M))
    if not found:
        raise SystemExit(f"no def_special entries found in {path}")
    return found


def parse_file(path: Path, firered: set[str]) -> dict:
    try:
        text = path.read_text(encoding="utf8")
    except UnicodeDecodeError as error:
        raise SystemExit(f"cannot decode {path}: {error}") from None

    labels = set()
    specials: Counter[str] = Counter()
    specialvars: Counter[str] = Counter()
    flags: Counter[str] = Counter()
    vars_: Counter[str] = Counter()
    for line in text.splitlines():
        label = LABEL.match(line)
        if label:
            name = label.group(1)
            # Script labels comprise map roots, EventScripts and named map
            # callbacks; movement/text/data labels are intentionally excluded.
            if ("MapScripts" in name or "EventScript" in name or name.endswith(("_OnLoad", "_OnTransition", "_OnFrame", "_OnWarp", "_OnResume", "_OnReturn", "_OnContinue", "_OnDive", "_OnExit"))):
                labels.add(name)

        match = DIRECTIVE.match(line)
        if not match:
            continue
        command, operands = match.group(1).lower(), match.group(2).strip()
        args = [part.strip() for part in operands.split(",")]
        if command == "special" and args:
            specials[args[0]] += 1
        elif command == "specialvar" and len(args) >= 2:
            specialvars[args[1]] += 1
        elif command in {"setflag", "clearflag", "checkflag", "goto_if_set", "goto_if_unset", "call_if_set", "call_if_unset"}:
            for token in IDENT.findall(args[0] if args else ""):
                if token.upper().startswith("FLAG_"):
                    flags[token] += 1
        elif command in {"setvar", "compare", "copyvar", "addvar", "subvar", "random", "goto_if_eq", "goto_if_ne", "goto_if_lt", "goto_if_le", "goto_if_gt", "goto_if_ge"}:
            for operand in args:
                for token in IDENT.findall(operand):
                    if token.upper().startswith("VAR_"):
                        vars_[token] += 1

    return {
        "map": path.parent.name,
        "script_labels": len(labels),
        "special_calls": sum(specials.values()),
        "specials": [{"name": name, "calls": count, "in_firered": name in firered} for name, count in sorted(specials.items())],
        "specialvar_calls": sum(specialvars.values()),
        "specialvars": [{"name": name, "calls": count, "in_firered": name in firered} for name, count in sorted(specialvars.items())],
        "flags": [{"name": name, "uses": count} for name, count in sorted(flags.items())],
        "vars": [{"name": name, "uses": count} for name, count in sorted(vars_.items())],
    }


def main() -> None:
    emerald = source_path("pokeemerald")
    maps_root = emerald / "data/maps"
    files = sorted(maps_root.glob("*/scripts.inc"))
    if len(files) != 468:
        raise SystemExit(f"expected 468 data/maps/*/scripts.inc files, found {len(files)} under {maps_root}")
    available = firered_specials(ROOT.parent / "pokefirered/data/specials.inc")
    rows = [parse_file(path, available) for path in files]
    if len({row["map"] for row in rows}) != len(rows):
        raise SystemExit("duplicate map names in Emerald scripts")
    all_specials = {item["name"] for row in rows for item in row["specials"]}
    all_specialvars = {item["name"] for row in rows for item in row["specialvars"]}
    missing = sorted((all_specials | all_specialvars) - available)
    data = {
        "maps": rows,
        "totals": {
            "maps": len(rows),
            "script_labels": sum(row["script_labels"] for row in rows),
            "special_calls": sum(row["special_calls"] for row in rows),
            "special_names": len(all_specials),
            "specialvar_calls": sum(row["specialvar_calls"] for row in rows),
            "specialvar_names": len(all_specialvars),
            "flags": len({item["name"] for row in rows for item in row["flags"]}),
            "vars": len({item["name"] for row in rows for item in row["vars"]}),
            "special_names_missing_from_firered": len(sorted((all_specials - available))),
            "specialvar_names_missing_from_firered": len(sorted((all_specialvars - available))),
        },
        "specials_missing_from_firered": missing,
    }
    write_output("emerald", "scripts.json", data, "pokeemerald", "tools/refs/emerald_scripts.py", entries=len(rows))
    print(f"{len(rows)} maps; {data['totals']['script_labels']} script labels; {data['totals']['special_calls']} special and {data['totals']['specialvar_calls']} specialvar calls")
    print(f"{len(missing)} called special names (including specialvar) absent from FireRed")


if __name__ == "__main__":
    main()
