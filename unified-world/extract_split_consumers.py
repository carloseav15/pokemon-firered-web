#!/usr/bin/env python3
"""Where the physical/special category and the type table are consumed, in four code bases.

Question answered (docs/MUNDO-UNIFICADO.md, rules phase): how big is the change to make the
category per-move and to add the Fairy type? Counted in:
  firered   pokefirered/            (C, the engine we port)
  emerald   ../refs-src/pokeemerald (C, same engine family)
  hns       ../refs-src/pokemon-hns (C, Modern Emerald fork that already did both changes)
  ts        src/core, src/games/firered (our port; generated data excluded)

A *site* is a line that decides the category from the move's type (`IS_TYPE_PHYSICAL`, `IS_TYPE_SPECIAL`,
or an inline comparison against TYPE_MYSTERY) or from the move's own category (`IS_MOVE_*`). The enclosing
function is found by a backwards search for a definition line (heuristic).

Usage: python3 unified-world/extract_split_consumers.py
Output: unified-world/out/split_consumers.json and unified-world/out/SPLIT_CONSUMERS.md
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "unified-world" / "out"
REFS = ROOT.parent / "refs-src"

C_SOURCES = {"firered": ROOT / "pokefirered", "emerald": REFS / "pokeemerald", "hns": REFS / "pokemon-hns"}
TS_DIRS = [ROOT / "src/core", ROOT / "src/games/firered"]

TYPE_MACRO = re.compile(r"\bIS_TYPE_(PHYSICAL|SPECIAL)\s*\(")
MOVE_MACRO = re.compile(r"\bIS_MOVE_(PHYSICAL|SPECIAL|STATUS)\s*\(")
MYSTERY_CMP = re.compile(r"(?:(?:===?|!==?|<=|>=|<|>)\s*(?:C\.)?TYPE_MYSTERY\b)|(?:\b(?:C\.)?TYPE_MYSTERY\s*(?:===?|!==?|<=|>=|<|>))")
FAIRY = re.compile(r"\bTYPE_FAIRY\b")
OPTION_STYLE = re.compile(r"\boptionStyle\b")

C_FUNC = re.compile(r"^(?:static\s+)?(?:const\s+)?[A-Za-z_][\w\s\*]*?\b([A-Za-z_]\w*)\s*\([^;{]*\)\s*(?:\{.*)?$")
TS_FUNC = re.compile(r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)|^(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(")


def files(root: Path, exts: tuple[str, ...], skip: tuple[str, ...] = ()) -> list[Path]:
    out = []
    for p in sorted(root.rglob("*")):
        if p.suffix in exts and p.is_file() and not any(s in p.parts for s in skip):
            out.append(p)
    return out


def enclosing(lines: list[str], idx: int, rx: re.Pattern, is_c: bool) -> str:
    for i in range(idx, -1, -1):
        line = lines[i]
        if is_c:
            if line and not line[0].isspace() and line[0] not in "#/}{*" and rx.match(line) and "=" not in line.split("(")[0]:
                m = rx.match(line)
                return m.group(1)
        else:
            m = rx.match(line)
            if m:
                return m.group(1) or m.group(2)
    return "?"


def scan(paths: list[Path], base: Path, is_c: bool) -> dict[str, list[dict]]:
    rx = C_FUNC if is_c else TS_FUNC
    res: dict[str, list[dict]] = {"typeMacro": [], "moveMacro": [], "mysteryCompare": [], "fairy": [], "optionStyle": []}
    for p in paths:
        try:
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        rel = str(p.relative_to(base))
        for i, line in enumerate(lines):
            code = line.split("//")[0]
            if not code.strip():
                continue
            entry = lambda kind: {"file": rel, "line": i + 1, "function": enclosing(lines, i, rx, is_c),  # noqa: E731
                                  "text": line.strip()[:140], "kind": kind}
            is_define = bool(re.match(r"\s*#\s*define|\s*export const IS_", line))
            if TYPE_MACRO.search(code):
                res["typeMacro"].append({**entry("definition" if is_define else "use")})
            if MOVE_MACRO.search(code):
                res["moveMacro"].append({**entry("definition" if is_define else "use")})
            if MYSTERY_CMP.search(code) and not is_define and "include/constants" not in rel:
                decides = bool(re.search(r"(?<![<>=!])(?:<|>)(?!=)\s*(?:C\.)?TYPE_MYSTERY|TYPE_MYSTERY\s*(?:<|>)(?!=)", code))
                res["mysteryCompare"].append(entry("category" if decides else "other"))
            if FAIRY.search(code):
                res["fairy"].append(entry("fairy"))
            if OPTION_STYLE.search(code):
                res["optionStyle"].append(entry("option"))
    return res


def main() -> int:
    data: dict[str, dict] = {}
    for name, root in C_SOURCES.items():
        if not root.exists():
            raise SystemExit(f"{name}: {root} not found")
        paths = files(root / "src", (".c", ".h")) + files(root / "include", (".h",))
        data[name] = scan(paths, root, True)
    ts_paths = [p for d in TS_DIRS for p in files(d, (".ts",), skip=("generated", "node_modules"))]
    data["ts"] = scan(ts_paths, ROOT, False)

    def uses(source: str, key: str) -> list[dict]:
        return [e for e in data[source][key] if e["kind"] not in ("definition",)]

    summary = {}
    for s, d in data.items():
        summary[s] = {"typeMacroUses": len(uses(s, "typeMacro")), "moveMacroUses": len(uses(s, "moveMacro")),
                      "mysteryCompares": len([e for e in d["mysteryCompare"] if e["kind"] == "category"]),
                      "mysteryOther": len([e for e in d["mysteryCompare"] if e["kind"] == "other"]), "fairyLines": len(d["fairy"]),
                      "fairyFiles": len({e["file"] for e in d["fairy"]}), "optionStyleLines": len(d["optionStyle"]),
                      "filesTouchingCategory": len({e["file"] for k in ("typeMacro", "moveMacro", "mysteryCompare")
                                                    for e in d[k] if e["kind"] not in ("definition", "other")})}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "split_consumers.json").write_text(json.dumps({
        "_meta": {"generator": "unified-world/extract_split_consumers.py",
                  "note": "enclosing function is a backwards-search heuristic; lines are as found"},
        "summary": summary, "sources": data}, indent=1, sort_keys=True) + "\n")

    md = ["# Consumidores de la categoría y de Hada (generado)", "",
          "Generado por `unified-world/extract_split_consumers.py`; no editar a mano. Un *sitio* es una línea que decide la",
          "categoría a partir del tipo del movimiento (`IS_TYPE_*` o una comparación con `TYPE_MYSTERY`) o a partir de la",
          "categoría propia del movimiento (`IS_MOVE_*`). La función contenedora es una búsqueda heurística hacia atrás.", "",
          "| Fuente | Usos de `IS_TYPE_*` | Usos de `IS_MOVE_*` | Comparaciones `<`/`>` con `TYPE_MYSTERY` (categoría) | Archivos | Líneas con `TYPE_FAIRY` (archivos) | Líneas con `optionStyle` |",
          "|---|--:|--:|--:|--:|---|--:|"]
    for s, v in summary.items():
        md.append(f"| {s} | {v['typeMacroUses']} | {v['moveMacroUses']} | {v['mysteryCompares']} | "
                  f"{v['filesTouchingCategory']} | {v['fairyLines']} ({v['fairyFiles']}) | {v['optionStyleLines']} |")
    for s in ("firered", "ts", "hns"):
        md += ["", f"## {s}", "", "| Archivo:línea | Función | Código |", "|---|---|---|"]
        rows = [e for k in ("typeMacro", "moveMacro", "mysteryCompare") for e in data[s][k]]
        for e in sorted(rows, key=lambda e: (e["file"], e["line"])):
            tag = " (definición)" if e["kind"] == "definition" else " (no decide categoría)" if e["kind"] == "other" else ""
            md.append(f"| `{e['file']}:{e['line']}` | {e['function']}{tag} | `{e['text'].replace('|', '/')}` |")
    fairy_files = Counter(e["file"] for e in data["hns"]["fairy"])
    md += ["", "## Hada en HnS: líneas por archivo", "", "| Archivo | Líneas con `TYPE_FAIRY` |", "|---|--:|"]
    for f, n in fairy_files.most_common():
        md.append(f"| `{f}` | {n} |")
    opt = Counter(e["file"] for e in data["hns"]["optionStyle"])
    md += ["", "## `optionStyle` en HnS (conmutador entre reglas originales y modernas)", "",
           "| Archivo | Líneas |", "|---|--:|"] + [f"| `{f}` | {n} |" for f, n in opt.most_common()]
    fr_files = sorted({e["file"] for k in ("typeMacro", "mysteryCompare") for e in data["firered"][k]
                       if e["kind"] not in ("definition", "other")})
    ts_files = sorted({e["file"] for k in ("typeMacro", "mysteryCompare") for e in data["ts"][k]
                       if e["kind"] not in ("definition", "other")})
    hns_move = len([e for e in data["hns"]["moveMacro"] if e["kind"] != "definition"])
    hns_move_files = len({e["file"] for e in data["hns"]["moveMacro"] if e["kind"] != "definition"})
    md += ["", "## Lectura (interpretación, no medida)", "",
           f"- **FireRed** decide la categoría en {summary['firered']['typeMacroUses']} sitios de {len(fr_files)} archivos "
           f"({', '.join(f'`{f}`' for f in fr_files)}).",
           f"- **Nuestro TypeScript** replica ese mismo reparto: {summary['ts']['typeMacroUses']} usos de la macro más "
           f"{summary['ts']['mysteryCompares']} comparaciones en línea con `TYPE_MYSTERY`, en {len(ts_files)} archivos "
           f"({', '.join(f'`{f}`' for f in ts_files)}).",
           f"- **HnS** añadió un campo `category` por movimiento y {hns_move} usos de `IS_MOVE_*` en {hns_move_files} archivos, "
           f"y conservó la rama original bajo `optionStyle` (un ajuste del jugador que alterna las reglas).",
           f"- **Hada** tocó {summary['hns']['fairyFiles']} archivos en HnS: constantes, tabla de efectividad de tipos, datos de "
           "especies y movimientos, y las pantallas que dibujan tipos (resumen, Pokédex, menús).",
           "- `optionStyle` también aparece en `battle_factory`, `battle_tower`, `battle_tent` y `battle_dome` (instalaciones "
           "del Frente de Batalla de Emerald, que no está en FireRed); no se ha verificado para qué lo usan allí.",
           "- Esto mide **dónde** hay que tocar, no cuánto cuesta ni si el resultado es correcto."]
    (OUT / "SPLIT_CONSUMERS.md").write_text("\n".join(md) + "\n")
    print(json.dumps(summary, indent=0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
