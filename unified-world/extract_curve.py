#!/usr/bin/env python3
"""Finite trainer experience supply per region against the experience needed to reach each level.

Question answered (docs/MUNDO-UNIFICADO.md, "curva de experiencia"): with three regions, can the player
reach level 100 long before the content ends, and where does the trainer XP of each region put a team?

Only **trainers** are counted: their XP is finite (one fight each). Wild encounters are unbounded
(grinding) and are NOT measured here. Gen 3 formula per defeated Pokémon, one participant, trainer battle:
    exp = floor(1.5 * expYield * level / 7)
Not modelled: Lucky Egg, Exp. Share, Pokémon owned by trade, level-dependent scaling (Gen 5+), double
battles, trainers used as rematches. The numbers are an upper bound of the trainer XP the story offers.

Trainers are those referenced by a `trainerbattle*` line in the decomp's scripts, minus rematch
constants. Species data (expYield, growth rate, XP tables) come from FireRed's table, which covers every
Gen 1-3 species; later-generation species in HnS are counted as unresolved and excluded.

Usage: python3 unified-world/extract_curve.py
Output: unified-world/out/curve.json and unified-world/out/CURVE.md
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_levels as lv  # noqa: E402  (strip_comments, matching, loaders)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "unified-world" / "out"
DECOMPS = {"firered": ROOT / "pokefirered", "emerald": ROOT.parent / "refs-src" / "pokeemerald",
           "hns": ROOT.parent / "refs-src" / "pokemon-hns"}
TRAINER_LINE = re.compile(r"^\s*trainerbattle\w*\b(.*)$")
TRAINER_CONST = re.compile(r"\bTRAINER_[A-Z0-9_]+\b")
NOT_TRAINERS = {"TRAINER_NONE", "TRAINER_PLAYER", "TRAINER_UNKNOWN"}


def used_trainers(decomp: Path) -> set[str]:
    found: set[str] = set()
    files = list((decomp / "data" / "maps").glob("*/scripts.inc")) + list((decomp / "data" / "scripts").glob("*.inc"))
    for f in files:
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            m = TRAINER_LINE.match(line)
            if m:
                found.update(t for t in TRAINER_CONST.findall(m.group(1))
                             if t not in NOT_TRAINERS and not t.startswith(("TRAINER_BATTLE_", "TRAINER_CLASS_")))
    return found


def all_trainers(source: str) -> dict[str, list[dict]]:
    """const -> party [{species, level}] for every trainer of the source."""
    if source == "firered":
        consts = json.loads((ROOT / "public/fr/constants.json").read_text())
        data = json.loads((ROOT / "public/fr/data/trainers.json").read_text())
        names = {v: k for k, v in consts.items() if k.startswith("SPECIES_")}
        out = {}
        for k, v in consts.items():
            if k.startswith("TRAINER_") and not k.startswith("TRAINER_CLASS_") and isinstance(v, int) and v < len(data):
                out[k] = [{"species": names.get(m["species"], str(m["species"])), "level": m["level"]}
                          for m in data[v]["party"]]
        return out
    if source == "emerald":
        return {t["const"]: [{"species": m["species"], "level": m["lvl"]} for m in t["party"]]
                for t in json.loads((ROOT / "refs/emerald/trainers.json").read_text())["data"]}
    # hns: tolerant reader (same parser as extract_levels, every class)
    src = lv.HNS
    ptxt = lv.strip_comments((src / "trainer_parties.h").read_text(encoding="utf-8", errors="replace"))
    parties = {}
    for m in re.finditer(r"static const struct \w+\s+(sParty_\w+)\s*\[\]\s*=\s*\{", ptxt):
        body = ptxt[m.end() - 1:lv.matching(ptxt, m.end() - 1)]
        lvls = [int(x) for x in re.findall(r"\.lvl\s*=\s*(\d+)", body)]
        sp = re.findall(r"\.species\s*=\s*(SPECIES_\w+)", body)
        parties[m.group(1)] = [{"species": s, "level": l} for s, l in zip(sp, lvls)]
    ttxt = lv.strip_comments((src / "trainers.h").read_text(encoding="utf-8", errors="replace"))
    out = {}
    for m in re.finditer(r"\[(TRAINER_\w+)\]\s*=\s*\{", ttxt):
        body = ttxt[m.end() - 1:lv.matching(ttxt, m.end() - 1)]
        p = re.search(r"\.party\s*=\s*\w+\((sParty_\w+)\)", body)
        if p and p.group(1) in parties:
            out[m.group(1)] = parties[p.group(1)]
    return out


def main() -> int:
    consts = json.loads((ROOT / "public/fr/constants.json").read_text())
    spec = json.loads((ROOT / "public/fr/data/species.json").read_text())
    exp_tables = spec["exp"]
    info = {k: spec["species"][v] for k, v in consts.items()
            if k.startswith("SPECIES_") and isinstance(v, int) and v < len(spec["species"])}

    def level_for(xp: float, table: list[int]) -> int:
        return max(l for l in range(1, 101) if table[l] <= xp)

    medium_fast, medium_slow = exp_tables[0], exp_tables[3]
    result = {}
    for source in ("firered", "emerald", "hns"):
        trainers = all_trainers(source)
        wanted = {t for t in used_trainers(DECOMPS[source]) if not lv.is_rematch(t) and t in trainers}
        xp = 0
        mons = 0
        unresolved: dict[str, int] = {}
        levels = []
        for t in sorted(wanted):
            for m in trainers[t]:
                rec = info.get(m["species"])
                if rec is None:
                    unresolved[m["species"]] = unresolved.get(m["species"], 0) + 1
                    continue
                xp += int(1.5 * rec["expYield"] * m["level"] / 7)
                mons += 1
                levels.append(m["level"])
        levels.sort()
        result[source] = {
            "trainersUsed": len(wanted), "pokemon": mons, "xpSupply": xp,
            "levelMin": levels[0], "levelMedian": levels[len(levels) // 2], "levelMax": levels[-1],
            "unresolvedSpecies": dict(sorted(unresolved.items(), key=lambda kv: -kv[1])[:12]),
            "unresolvedPokemon": sum(unresolved.values()),
        }
    total = sum(r["xpSupply"] for r in result.values())

    def team_levels(xp_total: float, share: int, table: list[int]) -> int:
        return level_for(xp_total / share, table)

    for r in result.values():
        r["levelIfOnePokemon"] = {"mediumFast": team_levels(r["xpSupply"], 1, medium_fast),
                                  "mediumSlow": team_levels(r["xpSupply"], 1, medium_slow)}
        r["levelIfSplitSix"] = {"mediumFast": team_levels(r["xpSupply"], 6, medium_fast),
                                "mediumSlow": team_levels(r["xpSupply"], 6, medium_slow)}
    combined = {"xpSupply": total,
                "levelIfOnePokemon": {"mediumFast": level_for(total, medium_fast), "mediumSlow": level_for(total, medium_slow)},
                "levelIfSplitSix": {"mediumFast": level_for(total / 6, medium_fast), "mediumSlow": level_for(total / 6, medium_slow)}}
    ladder = json.loads((OUT / "stages.json").read_text())["_meta"]["ladder"]

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "curve.json").write_text(json.dumps({
        "_meta": {"generator": "unified-world/extract_curve.py", "formula": "floor(1.5 * expYield * level / 7)",
                  "scope": "finite trainer XP only; wild XP unbounded and not measured",
                  "tables": {"mediumFast@100": medium_fast[100], "mediumSlow@100": medium_slow[100]}},
        "regions": result, "combined": combined, "ladder": ladder}, indent=1, sort_keys=True) + "\n")

    md = ["# Suministro de experiencia de entrenadores (generado)", "",
          "Generado por `unified-world/extract_curve.py`; no editar a mano. Solo entrenadores (XP finita): la XP de",
          "Pokémon salvajes es ilimitada y **no se mide**. Fórmula gen 3 con un participante y combate de",
          "entrenador: `floor(1.5 × expYield × nivel / 7)`. No modela Huevo Suerte ni Repartir Experiencia.", "",
          "| Fuente | Entrenadores usados | Pokémon | XP total | Nivel de los rivales (mín / mediana / máx) | Sin resolver |",
          "|---|--:|--:|--:|---|--:|"]
    for s, r in result.items():
        md.append(f"| {s} | {r['trainersUsed']} | {r['pokemon']} | {r['xpSupply']:,} | "
                  f"{r['levelMin']} / {r['levelMedian']} / {r['levelMax']} | {r['unresolvedPokemon']} |")
    md += ["", "## Qué nivel alcanzaría un equipo con toda esa XP", "",
           "| Fuente | 1 Pokémon (rápido-medio) | 1 Pokémon (medio-lento) | 6 Pokémon repartido (rápido-medio) | "
           "6 Pokémon repartido (medio-lento) |", "|---|--:|--:|--:|--:|"]
    for s, r in result.items():
        md.append(f"| {s} | {r['levelIfOnePokemon']['mediumFast']} | {r['levelIfOnePokemon']['mediumSlow']} | "
                  f"{r['levelIfSplitSix']['mediumFast']} | {r['levelIfSplitSix']['mediumSlow']} |")
    c = combined
    md += [f"| **las tres juntas** ({c['xpSupply']:,} XP) | {c['levelIfOnePokemon']['mediumFast']} | "
           f"{c['levelIfOnePokemon']['mediumSlow']} | {c['levelIfSplitSix']['mediumFast']} | "
           f"{c['levelIfSplitSix']['mediumSlow']} |", ""]
    md += ["Cota superior: asume que ningún combate se evita y que el equipo gana toda la XP de entrenadores. Contrasta con",
           f"la escalera de aces de líderes ({', '.join(map(str, ladder))}).", "",
           "## Límites", "",
           "- Los entrenadores se detectan por las líneas `trainerbattle*` de los scripts: pueden incluir alguno",
           "  inaccesible y omitir los que se generan por `special` o por scripts compartidos.",
           "- HnS tiene especies posteriores a la generación 3 que no están en la tabla de FireRed; se excluyen y se",
           "  cuentan en «Sin resolver». Su XP real sería algo mayor.",
           "- No se mide la XP de salvajes, que es lo que realmente permite sobrepasar la curva (grind)."]
    (OUT / "CURVE.md").write_text("\n".join(md) + "\n")
    print(json.dumps({s: {k: r[k] for k in ("trainersUsed", "pokemon", "xpSupply", "levelIfOnePokemon", "levelIfSplitSix",
                                            "unresolvedPokemon")} for s, r in result.items()}, indent=0))
    print("combined", combined)
    return 0


if __name__ == "__main__":
    sys.exit(main())
