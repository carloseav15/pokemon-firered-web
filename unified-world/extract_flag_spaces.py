#!/usr/bin/env python3
"""Audit of the flag and variable ID spaces of FireRed, Emerald and Heart & Soul.

Question answered (docs/MUNDO-UNIFICADO.md, A9 and phase 1): can the three games' scripts share one
flag/var space? The answer is measured, not assumed:
  * ID collisions: the same numeric ID with a different name in two games, restricted to IDs that scripts
    of both games actually use ("live" collisions).
  * Same-name flags whose numeric IDs differ (they cannot be copied by number).
  * Candidate names for the global layer (badges, field-move items, dex...), same name in all three.

Sources: public/fr/constants.json, public/emerald/constants.json (evaluated by the exporter) and
include/constants/{flags,vars,opponents}.h of the Heart & Soul checkout (evaluated here).

Usage: python3 unified-world/extract_flag_spaces.py
Output: unified-world/out/flag_spaces.json, flag_ids.json (name -> ID per source) and FLAG_SPACES.md
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "unified-world" / "out"
DECOMPS = {"firered": ROOT / "pokefirered", "emerald": ROOT.parent / "refs-src" / "pokeemerald",
           "hns": ROOT.parent / "refs-src" / "pokemon-hns"}
TOKEN = re.compile(r"\b(FLAG_[A-Z0-9_]+|VAR_[A-Z0-9_]+)\b")
DEFINE = re.compile(r"^\s*#define\s+([A-Za-z_]\w*)\s+(.+?)\s*$")
GLOBAL_PATTERNS = [r"FLAG_BADGE\d\d_GET", r"FLAG_SYS_POKEDEX_GET", r"FLAG_SYS_POKEMON_GET", r"FLAG_SYS_NATIONAL_DEX",
                   r"FLAG_SYS_B_DASH", r"FLAG_SYS_GAME_CLEAR", r"FLAG_RECEIVED_.*HM\d\d", r"FLAG_GOT_.*HM\d\d",
                   r"FLAG_RECEIVED_BIKE", r"FLAG_RECEIVED_.*(ROD|BIKE|COIN_CASE|ITEMFINDER|POKE_FLUTE)",
                   r"FLAG_SYS_.*_GET", r"FLAG_SYS_HAS_.*"]


def strip_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.S)


def eval_defines(paths: list[Path]) -> dict[str, int]:
    raw: dict[str, str] = {}
    for p in paths:
        if not p.exists():
            continue
        for line in strip_comments(p.read_text(encoding="utf-8", errors="replace")).splitlines():
            m = DEFINE.match(line)
            if m and "(" not in m.group(1):
                raw[m.group(1)] = m.group(2)
    cache: dict[str, int | None] = {}

    def value(name: str, depth: int = 0) -> int | None:
        if name in cache:
            return cache[name]
        if name not in raw or depth > 40:
            return None
        expr = re.sub(r"\b([A-Za-z_]\w*)\b", lambda mm: str(value(mm.group(1), depth + 1))
                      if not re.fullmatch(r"0[xX][0-9a-fA-F]+|\d+", mm.group(1)) else mm.group(1), raw[name])
        if re.search(r"[A-Za-z_]", re.sub(r"0[xX][0-9a-fA-F]+", "", expr)) or "None" in expr:
            cache[name] = None
            return None
        try:
            cache[name] = int(eval(expr, {"__builtins__": {}}, {}))  # constants and + - * | << only
        except Exception:
            cache[name] = None
        return cache[name]

    return {n: v for n in raw if (v := value(n)) is not None}


def spaces(source: str) -> tuple[dict[str, int], dict[str, int]]:
    if source in ("firered", "emerald"):
        path = ROOT / ("public/fr/constants.json" if source == "firered" else "public/emerald/constants.json")
        c = json.loads(path.read_text())
        return ({k: v for k, v in c.items() if k.startswith("FLAG_") and isinstance(v, int)},
                {k: v for k, v in c.items() if k.startswith("VAR_") and isinstance(v, int)})
    inc = DECOMPS["hns"] / "include" / "constants"
    d = eval_defines([inc / "opponents.h", inc / "flags.h", inc / "vars.h"])
    return ({k: v for k, v in d.items() if k.startswith("FLAG_")}, {k: v for k, v in d.items() if k.startswith("VAR_")})


def used_in_scripts(decomp: Path) -> set[str]:
    out: set[str] = set()
    files = list((decomp / "data" / "maps").glob("*/scripts.inc")) + list((decomp / "data" / "scripts").glob("*.inc"))
    for f in files:
        out.update(TOKEN.findall(f.read_text(encoding="utf-8", errors="replace")))
    return out


def invert(d: dict[str, int]) -> dict[int, list[str]]:
    r: dict[int, list[str]] = {}
    for k, v in d.items():
        r.setdefault(v, []).append(k)
    return r


def compare(a: str, b: str, kind: str, space: dict, used: dict) -> dict:
    na, nb = space[a][kind], space[b][kind]
    ia, ib = invert(na), invert(nb)
    shared_ids = set(ia) & set(ib)
    same = [i for i in shared_ids if set(ia[i]) & set(ib[i])]
    diff = [i for i in shared_ids if not (set(ia[i]) & set(ib[i]))]
    live = [i for i in diff if any(n in used[a] for n in ia[i]) and any(n in used[b] for n in ib[i])]
    names = set(na) & set(nb)
    renum = [n for n in names if na[n] != nb[n]]
    live_renum = [n for n in renum if n in used[a] and n in used[b]]
    return {"idsInBoth": len(shared_ids), "sameName": len(same), "differentName": len(diff),
            "liveCollisions": len(live), "sameNameInBoth": len(names), "sameNameDifferentId": len(renum),
            "liveSameNameDifferentId": len(live_renum),
            "examples": [{"id": i, a: ia[i], b: ib[i]} for i in sorted(live)[:6]]}


def main() -> int:
    space = {s: dict(zip(("flags", "vars"), spaces(s))) for s in DECOMPS}
    used = {s: used_in_scripts(DECOMPS[s]) for s in DECOMPS}
    pairs = [("firered", "emerald"), ("firered", "hns"), ("emerald", "hns")]
    cmp = {f"{a}|{b}": {k: compare(a, b, k, space, used) for k in ("flags", "vars")} for a, b in pairs}

    common_all = set(space["firered"]["flags"]) & set(space["emerald"]["flags"]) & set(space["hns"]["flags"])
    pat = [re.compile(p) for p in GLOBAL_PATTERNS]
    candidates = sorted(n for n in common_all if any(p.fullmatch(n) for p in pat))
    per_source_hm = {s: sorted(n for n in space[s]["flags"] if re.search(r"HM\d\d|HM_|_HM", n)) for s in DECOMPS}

    info = {s: {"flags": len(space[s]["flags"]), "vars": len(space[s]["vars"]),
                "flagMax": max(space[s]["flags"].values()), "varMax": max(space[s]["vars"].values()),
                "flagsUsedByScripts": sum(1 for n in space[s]["flags"] if n in used[s]),
                "varsUsedByScripts": sum(1 for n in space[s]["vars"] if n in used[s])} for s in DECOMPS}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "flag_spaces.json").write_text(json.dumps({
        "_meta": {"generator": "unified-world/extract_flag_spaces.py",
                  "note": "live = used by scripts of both games; names as in each decomp"},
        "spaces": info, "comparisons": cmp, "globalCandidates": candidates, "hmFlagNames": per_source_hm},
        indent=1, sort_keys=True) + "\n")

    (OUT / "flag_ids.json").write_text(json.dumps(
        {s_: {"flags": space[s_]["flags"], "vars": space[s_]["vars"]} for s_ in DECOMPS},
        sort_keys=True, separators=(",", ":")) + "\n")

    md = ["# Espacios de flags y variables (generado)", "",
          "Generado por `unified-world/extract_flag_spaces.py`; no editar a mano. «Viva» = el ID lo usan scripts de **ambos**",
          "juegos con nombres distintos, es decir, compartir un solo espacio los corrompería.", "",
          "## Tamaño de cada espacio", "",
          "| Fuente | Flags | Usadas en scripts | Máx. ID flag | Vars | Usadas en scripts | Máx. ID var |",
          "|---|--:|--:|--:|--:|--:|--:|"]
    for s, i in info.items():
        md.append(f"| {s} | {i['flags']} | {i['flagsUsedByScripts']} | {i['flagMax']} | {i['vars']} | "
                  f"{i['varsUsedByScripts']} | {i['varMax']} |")
    for kind, label in (("flags", "Flags"), ("vars", "Variables")):
        md += ["", f"## {label}: colisiones entre pares", "",
               "| Par | IDs comunes | Mismo nombre | Nombre distinto | **Colisiones vivas** | Mismo nombre, otro ID | …de ellas vivas |",
               "|---|--:|--:|--:|--:|--:|--:|"]
        for pair, c in cmp.items():
            x = c[kind]
            md.append(f"| {pair.replace('|', ' ↔ ')} | {x['idsInBoth']} | {x['sameName']} | {x['differentName']} | "
                      f"**{x['liveCollisions']}** | {x['sameNameDifferentId']} | {x['liveSameNameDifferentId']} |")
    md += ["", "Ejemplos de colisión viva (flags):", ""]
    for pair, c in cmp.items():
        a, b = pair.split("|")
        for e in c["flags"]["examples"][:3]:
            md.append(f"- {a} ↔ {b}, ID {e['id']}: `{', '.join(e[a])}` frente a `{', '.join(e[b])}`")
    md += ["", f"## Candidatos a la capa global (mismo nombre en las tres fuentes): {len(candidates)}", "",
           "Coinciden por **nombre** con un patrón de medalla, sistema o MO; el significado debe confirmarse a mano.", "",
           ", ".join(f"`{n}`" for n in candidates[:80]) + (" …" if len(candidates) > 80 else ""), "",
           "## Notas", "",
           "- Igualdad de nombre no garantiza igualdad de significado (por ejemplo `FLAG_TEMP_*`).",
           "- HnS parte de Modern Emerald: comparte gran parte de la numeración con Emerald, así que su colisión con "
           "FireRed es la que cuenta para unir Kanto y Johto.",
           "- Los scripts se leen de `data/maps/*/scripts.inc` y `data/scripts/*.inc`; flags generadas por código no se ven."]
    (OUT / "FLAG_SPACES.md").write_text("\n".join(md) + "\n")
    print(json.dumps(info))
    for pair, c in cmp.items():
        print(pair, {k: (c[k]["idsInBoth"], c[k]["sameName"], c[k]["liveCollisions"], c[k]["sameNameDifferentId"]) for k in c})
    print("candidates", len(candidates))
    return 0


if __name__ == "__main__":
    sys.exit(main())
