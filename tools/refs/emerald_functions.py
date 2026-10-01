#!/usr/bin/env python3
"""Catalog every C function of pokeemerald against pokefirered.

Output: refs/emerald/functions.json, one entry per Emerald .c file:
  status      "shared" (same file name in FireRed) or "emerald_only"
  lines       line count of the Emerald file
  functions   {name: [status, emerald_line, firered_line]} where status is
              "identical"     same name and same body (whitespace and comments ignored)
              "different"     same name, different body: review before reusing
              "emerald_only"  only in Emerald
              "firered_only"  only in FireRed (emerald_line is 0)
"identical" is a textual comparison: the same body can still read different
globals, constants or struct layouts. Treat it as a hint, not a proof.

Usage: npm run refs:emerald-functions   (needs `npm run refs:fetch -- pokeemerald`)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import portInventory as P  # noqa: E402  (read-only reuse of the inventory C parser)
from common import source_path, write_output  # noqa: E402


def functions(path: Path) -> dict[str, tuple[int, str]]:
    """{name: (line, normalized body)} for each function definition in a .c file."""
    text = P.strip_c_comments(path.read_text(errors="replace"))
    out: dict[str, tuple[int, str]] = {}
    for m in P.FUNC_RE.finditer(text):
        name = m.group(1)
        if name in P.KEYWORDS or name in out:
            continue
        line = text.count("\n", 0, m.start(1)) + 1
        out[name] = (line, re.sub(r"\s+", "", P.body_after(text, m.end() - 1)))
    return out


def main() -> None:
    emerald = source_path("pokeemerald") / "src"
    firered = P.DECOMP / "src"
    catalog: dict[str, dict] = {}
    totals = {"identical": 0, "different": 0, "emerald_only": 0, "firered_only": 0}
    for path in sorted(emerald.glob("*.c")):
        e = functions(path)
        fr_path = firered / path.name
        f = functions(fr_path) if fr_path.exists() else {}
        entries: dict[str, list] = {}
        for name, (line, body) in e.items():
            if name not in f:
                status, fline = "emerald_only", 0
            else:
                status, fline = ("identical" if f[name][1] == body else "different"), f[name][0]
            entries[name] = [status, line, fline]
            totals[status] += 1
        for name, (fline, _) in f.items():
            if name not in e:
                entries[name] = ["firered_only", 0, fline]
                totals["firered_only"] += 1
        catalog[path.stem] = {
            "status": "shared" if fr_path.exists() else "emerald_only",
            "lines": path.read_text(errors="replace").count("\n"),
            "functions": entries,
        }
    write_output("emerald", "functions.json", {"files": catalog, "totals": totals}, "pokeemerald", "tools/refs/emerald_functions.py", entries=sum(len(f["functions"]) for f in catalog.values()))
    print(", ".join(f"{k}: {v}" for k, v in totals.items()))


if __name__ == "__main__":
    main()
