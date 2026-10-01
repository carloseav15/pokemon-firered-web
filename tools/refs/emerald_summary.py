#!/usr/bin/env python3
"""Summarize the Emerald function catalog by C file.

Output: refs/emerald/summary.json, one row per Emerald file with its line count
and function counts by comparison status, sorted by different + emerald_only.
The input is refs/emerald/functions.json; no source checkout is needed.

Usage: npm run refs:emerald-summary
"""

from __future__ import annotations

import json
from collections import Counter

from common import ROOT, write_output

STATUSES = ("identical", "different", "emerald_only", "firered_only")


def main() -> None:
    catalog = json.loads((ROOT / "refs/emerald/functions.json").read_text())["data"]
    files = catalog.get("files")
    if not isinstance(files, dict):
        raise SystemExit("refs/emerald/functions.json: missing data.files object")

    rows = []
    totals: Counter[str] = Counter()
    for filename, file_data in files.items():
        functions = file_data.get("functions")
        if not isinstance(functions, dict):
            raise SystemExit(f"{filename}: missing functions object")
        counts: Counter[str] = Counter()
        for name, entry in functions.items():
            if not isinstance(entry, list) or not entry or entry[0] not in STATUSES:
                raise SystemExit(f"{filename}.{name}: invalid function status {entry!r}")
            counts[entry[0]] += 1
        row = {
            "file": filename,
            "lines": file_data["lines"],
            **{status: counts[status] for status in STATUSES},
        }
        rows.append(row)
        totals.update(counts)

    rows.sort(key=lambda row: (-(row["different"] + row["emerald_only"]), row["file"]))
    expected_totals = catalog.get("totals")
    if expected_totals != {status: totals[status] for status in STATUSES}:
        raise SystemExit(
            "refs/emerald/functions.json: per-file status counts do not match data.totals "
            f"({dict(totals)!r} != {expected_totals!r})"
        )

    write_output("emerald", "summary.json", rows, "pokeemerald", "tools/refs/emerald_summary.py")
    print(f"{len(rows)} files summarized")
    print(", ".join(f"{status}: {totals[status]}" for status in STATUSES))


if __name__ == "__main__":
    main()
