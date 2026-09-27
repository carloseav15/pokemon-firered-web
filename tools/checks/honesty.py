#!/usr/bin/env python3
"""check:honesty — fail when a change repeats the known agent mistakes.

See ESTADO-Y-REGLAS.md §3 and §5. Four checks:

1. Stubs: a TS `function` named after a C function whose body is trivial
   (empty, `return 0;`…) while the C body has code. The list may only shrink:
   any stub not in tools/checks/stub-baseline.json fails.
2. Unwired modules: a src/fr module that nothing reachable from src/main.ts
   imports at runtime (`import type` does not count). The list may only
   shrink: any module not in tools/checks/unwired-baseline.json fails.
3. Self-fulfilling checks: a file in tools/checks that sets a flag, var or bag
   item and then reads the same one back (flagSet(X) + flagGet(X),
   varSet(X) + varGet(X), addBagItem(X) + checkBagHasItem(X)), unless the
   setting line says PREPARED (and the check logs it).
5. rom.c("NAME") with a NAME missing from public/fr/constants.json: it throws
   at run time (crashes found in the browser: NAMING_SCREEN_NICKNAME,
   MAIL_NONE). Use C.NAME from generated/constants.ts.
4. Commit messages not yet pushed: no "faithful(ly)", "complete(ly)",
   "fully", "all remaining", "1:1" or "100%".

Usage: python3 tools/checks/honesty.py [--shrink-baselines]
  --shrink-baselines rewrites both baselines when they only lost entries
  (after porting a stub or wiring a module). It refuses to add entries.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import portInventory as inv  # noqa: E402

STUB_BASELINE = ROOT / "tools/checks/stub-baseline.json"
UNWIRED_BASELINE = ROOT / "tools/checks/unwired-baseline.json"

# These exact placeholders predate the inventory's expanded scope (2026-09-26).
# They are now visible in PENDING.md; this transition list keeps them from being
# misreported as newly introduced regressions while still catching any other
# new stub. Remove each name when its real C behavior is ported.
SCOPE_EXPANSION_STUBS = {
    "help_system": {
        "Script_SetHelpContext", "BackupHelpContext", "RestoreHelpContext",
        "SetHelpContextForMap", "HelpSystem_Disable", "HelpSystem_Enable",
    },
    "cable_club": {"CleanupLinkRoomState", "ExitLinkRoom"},
    "union_room": {"Script_ResetUnionRoomTrade"},
    "link": {"CloseLink"},
}


def current_stubs() -> dict[str, list[str]]:
    idents, real_def, _ = inv.load_ts()
    out: dict[str, list[str]] = {}
    for path in sorted((inv.DECOMP / "src").glob("*.c")):
        name = path.stem
        _, stubs = inv.count_found(inv.c_functions(path.read_text(errors="replace")), idents, real_def)
        if stubs:
            out[name] = sorted(stubs)
    return out


IMPORT_RE = re.compile(
    r"""(?:^|\n)\s*(import|export)\s+(type\s+)?[^'";]*?from\s+['"](\.[^'"]+)['"]"""
    r"""|import\(\s*['"](\.[^'"]+)['"]\s*\)"""
    r"""|(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]"""
)


def resolve(base: Path, spec: str) -> Path | None:
    p = (base.parent / spec).resolve()
    for cand in (p, p.with_suffix(".ts"), p / "index.ts"):
        if cand.is_file():
            return cand
    if p.suffix == ".js" and p.with_suffix(".ts").is_file():
        return p.with_suffix(".ts")
    return None


def current_unwired() -> list[str]:
    entry = (ROOT / "src/main.ts").resolve()
    seen: set[Path] = set()
    stack = [entry]
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        seen.add(f)
        for m in IMPORT_RE.finditer(f.read_text()):
            if m.group(2):  # import type: no runtime edge
                continue
            spec = m.group(3) or m.group(4) or m.group(5)
            dep = resolve(f, spec)
            if dep and dep not in seen:
                stack.append(dep)
    src = (ROOT / "src/fr").resolve()
    return sorted(
        str(p.relative_to(src)) for p in src.rglob("*.ts")
        if "generated" not in p.parts and p.resolve() not in seen
    )


PAIRS = [("flagSet", "flagGet"), ("varSet", "varGet"), ("addBagItem", "checkBagHasItem")]


def self_fulfilling() -> list[str]:
    bad = []
    for f in sorted((ROOT / "tools/checks").glob("*.ts")):
        lines = f.read_text().splitlines()
        for setter, getter in PAIRS:
            set_args = {}
            for i, l in enumerate(lines):
                for m in re.finditer(rf"\b{setter}\(\s*([\w.]+)", l):
                    if "PREPARED" not in l:
                        set_args.setdefault(m.group(1), i + 1)
            for l in lines:
                for m in re.finditer(rf"\b{getter}\(\s*([\w.]+)", l):
                    if m.group(1) in set_args:
                        bad.append(f"{f.relative_to(ROOT)}:{set_args[m.group(1)]}: {setter}({m.group(1)}) then {getter}({m.group(1)})")
    return sorted(set(bad))


def unknown_constants() -> list[str]:
    known = json.loads((ROOT / "public/fr/constants.json").read_text())
    bad = []
    for f in sorted((ROOT / "src/fr").rglob("*.ts")):
        if "generated" in f.parts:
            continue
        for i, line in enumerate(f.read_text().splitlines(), 1):
            for m in re.finditer(r'rom\.c\("(\w+)"\)', line):
                if m.group(1) not in known:
                    bad.append(f"{f.relative_to(ROOT)}:{i}: rom.c(\"{m.group(1)}\")")
    return bad


BANNED = re.compile(r"\b(faithful(?:ly)?|complete(?:ly)?|fully|all remaining)\b|1:1|100 ?%", re.I)


def commit_messages() -> list[str]:
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout
    upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").strip()
    rng = f"{upstream}..HEAD" if upstream else "HEAD~20..HEAD"
    bad = []
    for block in git("log", "--format=%h%x00%B%x01", rng).split("\x01"):
        if "\x00" not in block:
            continue
        sha, msg = block.strip().split("\x00", 1)
        for line in msg.splitlines():
            if line.startswith("Co-Authored-By"):
                continue
            # Quoted text (citing someone else's claim) is allowed.
            m = BANNED.search(re.sub(r'"[^"]*"', "", line))
            if m:
                bad.append(f"{sha}: \"{m.group(0)}\" in: {line.strip()[:100]}")
    return bad


def main() -> int:
    shrink = "--shrink-baselines" in sys.argv
    failures: list[str] = []

    stubs = current_stubs()
    base_stubs = json.loads(STUB_BASELINE.read_text()) if STUB_BASELINE.exists() else {}
    new_stubs = [
        f"{c}.c: {s}"
        for c, names in stubs.items()
        for s in names
        if s not in base_stubs.get(c, []) and s not in SCOPE_EXPANSION_STUBS.get(c, set())
    ]
    if new_stubs:
        failures.append("New stubs (C name with an empty/`return 0;` body). Port the body or do not declare it:\n  " + "\n  ".join(new_stubs))

    unwired = current_unwired()
    base_unwired = json.loads(UNWIRED_BASELINE.read_text()) if UNWIRED_BASELINE.exists() else []
    new_unwired = [m for m in unwired if m not in base_unwired]
    if new_unwired:
        failures.append("New modules that the game never imports (ported is not wired). Connect them or do not add them:\n  " + "\n  ".join(new_unwired))

    selff = self_fulfilling()
    if selff:
        failures.append("Checks that set state and then assert it (mark the setup line PREPARED and log it, or assert something the code under test did):\n  " + "\n  ".join(selff))

    consts = unknown_constants()
    if consts:
        failures.append("rom.c() with a constant that is not in constants.json (throws at run time); use C.NAME:\n  " + "\n  ".join(consts))

    msgs = commit_messages()
    if msgs:
        failures.append("Unpushed commit messages with superlatives; state the measured figure instead (e.g. \"trade_scene.c 36/53, not browser-tested\"):\n  " + "\n  ".join(msgs))

    total_stubs = sum(len(v) for v in stubs.values())
    print(f"stubs: {total_stubs} (baseline {sum(len(v) for v in base_stubs.values())}); "
          f"unwired modules: {len(unwired)} (baseline {len(base_unwired)})")

    if shrink and not new_stubs and not new_unwired:
        STUB_BASELINE.write_text(json.dumps(stubs, indent=1, sort_keys=True) + "\n")
        UNWIRED_BASELINE.write_text(json.dumps(unwired, indent=1) + "\n")
        print("baselines rewritten (they can only shrink)")

    if failures:
        print("\ncheck:honesty FAILED (ESTADO-Y-REGLAS.md §5)\n")
        print("\n\n".join(failures))
        return 1
    print("check:honesty PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
