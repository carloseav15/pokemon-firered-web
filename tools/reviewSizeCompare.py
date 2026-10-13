#!/usr/bin/env python3
"""Rank C functions whose same-named TS port is much smaller (a hint of skipped logic, not a proof).

Usage: tools/reviewSizeCompare.py <c-file> <ts-file>... [--min N] [--ratio R]
Counts statements (`;`), `case` labels and branches/loops in the C body and in the TS function or class method of
the same name, and lists the functions where TS < ratio * C (default 0.6, with C >= min = 8). Names are matched
exactly, so functions renamed in the port show as 'missing in TS'.
"""
import re, sys, pathlib

def bodies(src, rx):
    out = {}
    for m in rx.finditer(src):
        name = m.group(1)
        i = m.end() - 1
        depth = 0
        j = i
        while j < len(src):
            ch = src[j]
            if ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0: break
            j += 1
        out.setdefault(name, src[i:j])
    return out

C_RX = re.compile(r"^(?:static |const |extern )?[A-Za-z0-9_\*\s]+?\b(\w+)\([^;{]*\)\s*\n\{", re.M)
TS_RX = re.compile(r"^[ \t]*(?:export )?(?:private |public |protected |static |readonly )*(?:async )?(?:function )?(\w+)\s*\([^)]*\)\s*(?::\s*[^{;=]+)?\{", re.M)
SKIP = {"if", "for", "while", "switch", "catch", "return", "function"}

def stm(s):
    s = re.sub(r"//.*", "", s)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return s.count(";") + s.count("case ") + len(re.findall(r"\b(?:if|while|for)\b", s))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a.lstrip("-").split("=") for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    lo, ratio = int(opts.get("min", 8)), float(opts.get("ratio", 0.6))
    c = pathlib.Path(args[0]).read_text(errors="ignore")
    fc = bodies(c, C_RX)
    ft = {}
    for f in args[1:]:
        for n, b in bodies(pathlib.Path(f).read_text(errors="ignore"), TS_RX).items():
            if n not in SKIP: ft.setdefault(n, b)
    rows, missing = [], []
    for n, b in fc.items():
        a = stm(b)
        if a < lo: continue
        if n not in ft: missing.append((a, n)); continue
        t = stm(ft[n])
        if t < ratio * a: rows.append((a, t, n))
    rows.sort(reverse=True)
    print(f"{args[0]}: {len(fc)} C functions, {len(ft)} TS functions/methods, {len(rows)} smaller than {ratio:.0%} of the C")
    for a, t, n in rows: print(f"  SMALL   {n}: C {a} / TS {t}")
    for a, n in sorted(missing, reverse=True): print(f"  MISSING {n}: C {a}")

main()
