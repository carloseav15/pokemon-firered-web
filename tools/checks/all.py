#!/usr/bin/env python3
"""check:all — run every `check:*` npm script and separate regressions from known failures.

Known failures live in tools/checks/known-failing.json (TAREAS-FINALES.md §1.11).
  - A check that fails and is NOT listed is a regression: exit code 1.
  - A listed check that now passes is reported as FIXED: remove it from the list
    in the same commit that fixed it. Never add entries without the user's approval.
check:port and check:honesty are excluded (run them on their own).

Usage: npm run check:all            all checks
       npm run check:all -- weather slots   only checks whose name contains a word
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KNOWN = ROOT / "tools/checks/known-failing.json"
SKIP = {"check:port", "check:honesty", "check:all"}


def main() -> int:
    scripts = [k for k in json.loads((ROOT / "package.json").read_text())["scripts"] if k.startswith("check:") and k not in SKIP]
    filters = sys.argv[1:]
    if filters:
        scripts = [s for s in scripts if any(f in s for f in filters)]
    known = set(json.loads(KNOWN.read_text())["checks"])
    passed, regressions, still_failing, fixed = [], [], [], []
    for name in scripts:
        r = subprocess.run(["npm", "run", "-s", name], cwd=ROOT, capture_output=True, text=True)
        ok = r.returncode == 0
        if ok:
            (fixed if name in known else passed).append(name)
        elif name in known:
            still_failing.append(name)
        else:
            tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
            regressions.append((name, tail))
        print(f"{'PASS' if ok else 'FAIL'}  {name}{'  (conocido)' if not ok and name in known else ''}", flush=True)
    print(f"\n{len(passed)} pasan, {len(still_failing)} fallos conocidos, {len(fixed)} arreglados, {len(regressions)} regresiones")
    for name in fixed:
        print(f"FIXED: {name} ya pasa; quítalo de tools/checks/known-failing.json")
    for name, tail in regressions:
        print(f"REGRESIÓN: {name}")
        for line in tail:
            print(f"    {line[:200]}")
    return 1 if regressions else 0


if __name__ == "__main__":
    sys.exit(main())
