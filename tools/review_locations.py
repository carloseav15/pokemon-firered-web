#!/usr/bin/env python3
"""Locate every function named in section 2 of TAREAS-FINALES.md in the C and the TS.

Writes docs/REVIEW-LOCATIONS.md (generated; do not edit): for each section-2 block,
each backticked name with its C definition (`../pokefirered/src/<file>.c:<line>`) and
its TS definition (`src/fr/<path>:<line>`). Wildcards (`MovementAction_*`) are expanded
to counts. Names not found are listed so the reviewer can search by hand.

Usage: npm run review:where            regenerate docs/REVIEW-LOCATIONS.md
       npm run review:where -- Name    print the locations of one name
Line numbers move when code changes: regenerate before a review session.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import portInventory as P  # noqa: E402  (read-only reuse of the C parser and decomp path)

OUT = ROOT / "docs/REVIEW-LOCATIONS.md"
IDENT = re.compile(r"^[A-Za-z_]\w*$")
TS_DEF = [
    re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*[(<]"),
    re.compile(r"^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(?:\(|function|async)"),
    re.compile(r"^  (?:static\s+|private\s+|public\s+|async\s+)*([A-Za-z_]\w*)\s*\([^;]*\)\s*(?::\s*[^{=;]+)?\{"),
    re.compile(r"^\s*([A-Za-z_]\w*)\s*[:=]\s*(?:async\s+)?function\b"),
]


def c_index() -> dict[str, list[tuple[str, int]]]:
    idx: dict[str, list[tuple[str, int]]] = {}
    for path in sorted((P.DECOMP / "src").glob("*.c")):
        text = P.strip_c_comments(path.read_text(errors="replace"))
        for m in P.FUNC_RE.finditer(text):
            name = m.group(1)
            if name in P.KEYWORDS:
                continue
            idx.setdefault(name, []).append((path.name, text.count("\n", 0, m.start(1)) + 1))
    return idx


DOC = re.compile(r"^\s*/\*\*\s*([A-Za-z_]\w*)\b")


def ts_index() -> tuple[dict[str, list[tuple[str, int]]], dict[str, list[tuple[str, int]]]]:
    """(definitions, doc-comment mentions): the port often names the C function only in a `/** Name */` comment."""
    idx: dict[str, list[tuple[str, int]]] = {}
    doc: dict[str, list[tuple[str, int]]] = {}
    for path in sorted((ROOT / "src/fr").rglob("*.ts")):
        if "generated" in path.parts:
            continue
        rel = str(path.relative_to(ROOT))
        for n, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
            d = DOC.match(line)
            if d and ("_" in d.group(1) or any(ch.isupper() for ch in d.group(1))):
                doc.setdefault(d.group(1), []).append((rel, n))
            for rx in TS_DEF:
                m = rx.match(line)
                if m and m.group(1) not in ("if", "for", "while", "switch", "return", "catch", "constructor"):
                    idx.setdefault(m.group(1), []).append((rel, n))
                    break
    return idx, doc


def section2_blocks() -> list[tuple[str, list[str]]]:
    text = (ROOT / "TAREAS-FINALES.md").read_text()
    body = text[text.index("## 2."): text.index("## 3.")]
    blocks: list[tuple[str, list[str]]] = []
    current = "(sin archivo)"
    for line in body.splitlines():
        head = re.match(r"^\*\*`([\w.]+\.c)`\*\*", line)
        if head:
            current = head.group(1)
            blocks.append((current, []))
            continue
        if line.startswith("**Otros archivos**"):
            current = "otros"
            blocks.append((current, []))
            continue
        if not blocks or "DIFERENCIA" in line or "Revisión" in line:
            continue
        for tok in re.findall(r"`([^`]+)`", line):
            for part in tok.split("/"):
                part = part.strip()
                if part.endswith(".c") or part.endswith(".ts") or " " in part:
                    continue
                if part not in blocks[-1][1]:
                    blocks[-1][1].append(part)
    return blocks


def fmt(locs: list[tuple[str, int]], prefix: str) -> str:
    if not locs:
        return "—"
    shown = ", ".join(f"`{prefix}{f}:{n}`" for f, n in locs[:2])
    return shown + (f" (+{len(locs) - 2})" if len(locs) > 2 else "")


def describe(name: str, cidx, tidx, tdoc=None) -> str | None:
    tdoc = tdoc or {}
    if name.endswith("*"):
        stem = name[:-1]
        c = sorted({k for k in cidx if k.startswith(stem)})
        t = sorted({k for k in list(tidx) + list(tdoc) if k.startswith(stem)})
        if not c and not t:
            return None
        return f"| `{name}` | {len(c)} funciones | {len(t)} funciones |"
    if not IDENT.match(name):
        return None
    c, t = cidx.get(name, []), tidx.get(name, [])
    ts = fmt(t, "") if t else (fmt(tdoc[name], "") + " (comentario)" if name in tdoc else "—")
    if not c and ts == "—":
        return None
    return f"| `{name}` | {fmt(c, '')} | {ts} |"


def main() -> None:
    cidx = c_index()
    tidx, tdoc = ts_index()
    if len(sys.argv) > 1:
        for name in sys.argv[1:]:
            print(describe(name, cidx, tidx, tdoc) or f"{name}: no encontrado")
        return
    out = [
        "# Dónde está cada función de la sección 2 (generado)",
        "",
        "Generado por `npm run review:where` a partir de `TAREAS-FINALES.md` §2; no editar a mano.",
        "Las líneas cambian con el código: regenera antes de revisar. C: `../pokefirered/src/`.",
        "",
    ]
    missing: list[str] = []
    for block, names in section2_blocks():
        rows = []
        for name in names:
            row = describe(name, cidx, tidx, tdoc)
            if row:
                rows.append(row)
            elif IDENT.match(name.rstrip("*")):
                missing.append(f"{block}: `{name}`")
        if rows:
            out += [f"## {block}", "", "| Nombre | C | TS |", "|---|---|---|", *rows, ""]
    if missing:
        out += ["## No encontrados (buscar a mano)", "", *[f"- {m}" for m in missing], ""]
    OUT.write_text("\n".join(out))
    print(f"wrote {OUT.relative_to(ROOT)}: {sum(1 for l in out if l.startswith('| `'))} nombres, {len(missing)} sin localizar")


if __name__ == "__main__":
    main()
