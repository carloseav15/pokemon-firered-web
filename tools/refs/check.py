#!/usr/bin/env python3
"""Guard refs/: the game never imports it, outputs match their pins, MANIFEST is current.

Usage: npm run refs:check            fail on any problem
       npm run refs:check -- --write rewrite refs/MANIFEST.md (after running an extractor)
Does not need the source checkouts.
"""

from __future__ import annotations

import json
import re
import sys

from common import REFS, ROOT, SOURCES

IMPORT_RE = re.compile(r"""["'`][^"'`\n]*\brefs/[^"'`\n]*["'`]""")


def isolation_errors() -> list[str]:
    errs = []
    for path in sorted((ROOT / "src").rglob("*.ts")):
        for n, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
            if IMPORT_RE.search(line):
                errs.append(f"{path.relative_to(ROOT)}:{n}: src/ must not reference refs/ ({line.strip()[:80]})")
    return errs


def outputs() -> list[tuple[str, dict, int]]:
    out = []
    for path in sorted(REFS.rglob("*.json")):
        doc = json.loads(path.read_text())
        meta = doc.get("_meta", {})
        out.append((str(path.relative_to(REFS)), meta, meta.get("entries", 0)))
    return out


def meta_errors(items) -> list[str]:
    errs = []
    for rel, meta, _ in items:
        src = meta.get("source")
        if src not in SOURCES:
            errs.append(f"refs/{rel}: _meta.source {src!r} is not in tools/refs/sources.json")
        elif meta.get("commit") != SOURCES[src]["commit"]:
            errs.append(f"refs/{rel}: generated from {str(meta.get('commit'))[:10]}, pinned {SOURCES[src]['commit'][:10]}: rerun its generator")
        if not (ROOT / str(meta.get("generator", ""))).is_file():
            errs.append(f"refs/{rel}: generator {meta.get('generator')!r} not found")
    return errs


def manifest(items) -> str:
    lines = [
        "# refs: índice (generado)",
        "",
        "Generado por `npm run refs:check -- --write`; no editar a mano. Guía: [README.md](README.md).",
        "",
        "## Fuentes fijadas",
        "",
        "| Fuente | Commit | Nota |",
        "|---|---|---|",
    ]
    for name, spec in SOURCES.items():
        lines.append(f"| [{name}]({spec['repo'].removesuffix('.git')}) | `{spec['commit'][:10]}` | {spec.get('note', '')} |")
    lines += ["", "## Salidas", "", "| Archivo | Fuente | Entradas | Generador |", "|---|---|---:|---|"]
    for rel, meta, count in items:
        lines.append(f"| `{rel}` | {meta.get('source')} | {count} | `{meta.get('generator')}` |")
    return "\n".join(lines) + "\n"


def main() -> None:
    items = outputs()
    errs = isolation_errors() + meta_errors(items)
    text = manifest(items)
    path = REFS / "MANIFEST.md"
    if "--write" in sys.argv:
        path.write_text(text)
        print(f"wrote {path.relative_to(ROOT)}")
    elif not path.exists() or path.read_text() != text:
        errs.append("refs/MANIFEST.md is out of date: run `npm run refs:check -- --write`")
    for e in errs:
        print(e)
    if errs:
        sys.exit("refs:check FAILED")
    print(f"refs:check PASS ({len(items)} outputs)")


if __name__ == "__main__":
    main()
