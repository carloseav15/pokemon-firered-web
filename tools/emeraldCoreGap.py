#!/usr/bin/env python3
"""Compile src/core against src/games/emerald and summarise what Emerald still lacks.

Writes docs/EMERALD-BRECHA-NUCLEO.md (generated, do not edit). Read-only for src/: the tsconfig lives in
.decomp-build. Requires `EXPORT_GAME=emerald python3 tools/decomp/export.py` to have produced
src/games/emerald/generated (constants.ts, structs.ts).

Usage: python3 tools/emeraldCoreGap.py
"""
from __future__ import annotations

import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / ".decomp-build" / "tsconfig.emerald-core.json"
OUT = ROOT / "docs" / "EMERALD-BRECHA-NUCLEO.md"


def main() -> None:
    CFG.parent.mkdir(exist_ok=True)
    CFG.write_text(json.dumps({
        "extends": str(ROOT / "tsconfig.json"),
        "compilerOptions": {"incremental": False, "baseUrl": str(ROOT),
                            "paths": {"@game/*": ["./src/games/emerald/*"], "@core/*": ["./src/core/*"]}},
        "include": [str(ROOT / "src/core")],
    }))
    r = subprocess.run(["npx", "tsc", "--noEmit", "-p", str(CFG)], cwd=ROOT, capture_output=True, text=True)
    lines = [l for l in (r.stdout + r.stderr).splitlines() if "error TS" in l]
    missing: dict[str, set[str]] = defaultdict(set)
    kinds: Counter = Counter()
    consts: Counter = Counter()
    fields: dict[str, Counter] = defaultdict(Counter)
    other = 0
    contract = json.loads((ROOT / "tools/checks/layers-contract.json").read_text())["modules"]
    for l in lines:
        f = l.split("(")[0]
        m = re.search(r"Cannot find module '@game/([^']+)'", l)
        if m:
            missing[m.group(1)].add(f)
            continue
        c = re.search(r"Property '([A-Z0-9_]+)' does not exist on type 'typeof import\(", l)
        if c:
            consts[c.group(1)] += 1
            continue
        s = re.search(r"Property '(\w+)' does not exist on type '(\w+)'", l) or re.search(r"Property '(\w+)' does not exist on type '(\w+)'\. Did you mean", l)
        if s:
            fields[s.group(2)][s.group(1)] += 1
            continue
        other += 1
    for mod in contract:
        missing.setdefault(mod, set())
    present = [m for m in contract if (ROOT / "src/games/emerald" / f"{m}.ts").exists()]
    w: list[str] = []
    w += ["# Qué falta para compilar `src/core` contra Emerald (generado)", "",
          "Generado por `python3 tools/emeraldCoreGap.py` (compila `src/core` con `@game/*` → `src/games/emerald`). No editar a mano.",
          "Mide huecos de compilación, no de comportamiento: un núcleo que compila contra Emerald no es un Emerald que funciona.", "",
          f"- Errores de tipos: **{len(lines)}** en {len({l.split('(')[0] for l in lines})} archivos del núcleo.",
          f"- Módulos del contrato (`tools/checks/layers-contract.json`): {len(contract)}; Emerald proporciona {len(present)}: {', '.join(present) or 'ninguno'}.",
          f"- Constantes de FireRed que Emerald no define: {len(consts)} nombres, {sum(consts.values())} usos.",
          f"- Campos de estructuras que Emerald no tiene: {sum(len(v) for v in fields.values())} campos en {len(fields)} estructuras.",
          f"- Otros errores: {other}.", "",
          "## Módulos que el núcleo importa de `@game/` y Emerald no tiene", "",
          "| Módulo | Archivos del núcleo que lo importan |", "|---|---:|"]
    for mod, fs in sorted(missing.items(), key=lambda kv: -len(kv[1])):
        if (ROOT / "src/games/emerald" / f"{mod}.ts").exists():
            continue
        w.append(f"| `{mod}` | {len(fs)} |")
    w += ["", "## Constantes de FireRed ausentes en Emerald (más usadas)", "", "| Constante | Usos |", "|---|---:|"]
    w += [f"| `{k}` | {v} |" for k, v in consts.most_common(40)]
    w += ["", "## Campos de estructuras ausentes en Emerald", "", "| Estructura | Campos (usos) |", "|---|---|"]
    for st, cnt in sorted(fields.items(), key=lambda kv: -sum(kv[1].values())):
        w.append(f"| `{st}` | " + ", ".join(f"`{k}` ({v})" for k, v in cnt.most_common(12)) + " |")
    OUT.write_text("\n".join(w) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(lines)} errors, {len(missing)} modules, {len(consts)} constants, {len(fields)} structs")


if __name__ == "__main__":
    main()
