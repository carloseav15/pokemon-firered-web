#!/usr/bin/env python3
"""Compare the FireRed data exported from the decomp (public/fr) with PokéAPI.

The decomp is the source of truth; this measures how reliable PokéAPI is for
FireRed/LeafGreen (generation 3) or Platinum (generation 4). PokéAPI values
are reconstructed from the selected version group using its *_past and
move_changelog tables before comparing.

Usage:
  python3 tools/refs/compare_pokeapi.py [--csv DIR] [--out diffs.json]
  python3 tools/refs/compare_pokeapi.py --generation 4 [--csv DIR] [--out diffs.json]

--csv defaults to the pinned checkout (`npm run refs:fetch -- pokeapi`).
First run (2026-10-01) against PokeAPI/pokeapi bc92d3b: 7.528 values compared.
Known mapping gaps (not PokéAPI errors): gen 3 ability ids >= 77 are shifted by
one (ABILITY_CACOPHONY 76), FireRed Deoxys is the Attack Forme in PokéAPI, the
three ultimate-move tutors are not in sTutorMoves, and the decomp stores
100/0 where PokéAPI leaves accuracy or effect chance empty.
"""
import argparse, csv, json, sys
from collections import defaultdict, Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--csv", default=None, help="PokéAPI data/v2/csv directory (default: pinned checkout)")
ap.add_argument("--out", default=None, help="write comparison details to this JSON file")
ap.add_argument("--generation", type=int, choices=(3, 4), default=3, help="Pokémon generation to compare (default: 3)")
args = ap.parse_args()
if args.csv is None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from common import source_path
    args.csv = source_path("pokeapi") / "data/v2/csv"
CSV = Path(args.csv); FR = ROOT / "public/fr"
if not (CSV / "moves.csv").exists(): raise SystemExit(f"PokéAPI CSVs not found in {CSV}")
if args.generation == 4:
    from compare_pokeapi_gen4 import compare_platinum
    compare_platinum(CSV, ROOT, args.out)
    raise SystemExit(0)
VG, GEN = 7, 3
def rows(n): return list(csv.DictReader(open(CSV / f"{n}.csv", encoding="utf8")))
vg_order = {int(r["id"]): int(r["order"]) for r in rows("version_groups")}
sp = json.load(open(FR / "data/species.json")); species = sp["species"]
mv = json.load(open(FR / "data/moves.json"))["moves"]
by_nat = {s["national"]: (i, s) for i, s in enumerate(species) if s.get("national") and 1 <= s["national"] <= 386 and i < 412}
TYPE = lambda t: t + 1 if t < 9 else t          # gen3 type id -> PokéAPI id (9 = ???)
out = {}; ex = defaultdict(list)
def chk(cat, ok, detail):
    c = out.setdefault(cat, [0, 0]); c[0] += 1
    if not ok: c[1] += 1; ex[cat].append(detail)
# ---- species
stats_cur = defaultdict(dict); ev_cur = defaultdict(dict)
for r in rows("pokemon_stats"): stats_cur[int(r["pokemon_id"])][int(r["stat_id"])] = int(r["base_stat"]); ev_cur[int(r["pokemon_id"])][int(r["stat_id"])] = int(r["effort"])
past = defaultdict(lambda: defaultdict(list))
for r in rows("pokemon_stats_past"): past[int(r["pokemon_id"])][int(r["stat_id"])].append((int(r["generation_id"]), int(r["base_stat"]), int(r["effort"])))
def stat3(p, s):
    c = sorted(x for x in past[p][s] if x[0] >= GEN)
    return (c[0][1], c[0][2]) if c else (stats_cur[p][s], ev_cur[p][s])
types_cur = defaultdict(list); types_past = defaultdict(lambda: defaultdict(list))
for r in rows("pokemon_types"): types_cur[int(r["pokemon_id"])].append((int(r["slot"]), int(r["type_id"])))
for r in rows("pokemon_types_past"): types_past[int(r["pokemon_id"])][int(r["generation_id"])].append((int(r["slot"]), int(r["type_id"])))
def types3(p):
    g = sorted(x for x in types_past[p] if x >= GEN)
    return [t for _, t in sorted(types_past[p][g[0]] if g else types_cur[p])]
ab_cur = defaultdict(dict); ab_past = defaultdict(lambda: defaultdict(dict))
for r in rows("pokemon_abilities"):
    if r["is_hidden"] == "0": ab_cur[int(r["pokemon_id"])][int(r["slot"])] = int(r["ability_id"])
for r in rows("pokemon_abilities_past"):
    if r["is_hidden"] == "0": ab_past[int(r["pokemon_id"])][int(r["generation_id"])][int(r["slot"])] = int(r["ability_id"]) if r["ability_id"] else 0
def ab3(p):
    a = dict(ab_cur[p])
    for g in sorted(x for x in ab_past[p] if x >= GEN)[:1]: a.update(ab_past[p][g])
    return sorted(v for v in a.values() if v)
spc = {int(r["id"]): r for r in rows("pokemon_species")}
eggg = defaultdict(set)
for r in rows("pokemon_egg_groups"): eggg[int(r["species_id"])].add(int(r["egg_group_id"]))
GROWTH = {0: 2, 1: 5, 2: 6, 3: 4, 4: 3, 5: 1}
GENDER = {0: 0, 31: 1, 63: 2, 127: 4, 191: 6, 254: 8, 255: -1}
ORDER = [1, 2, 3, 6, 4, 5]  # gen3 [hp,atk,def,spe,spa,spd] -> PokéAPI stat ids
for nat, (idx, s) in sorted(by_nat.items()):
    name = spc[nat]["identifier"]
    b = [stat3(nat, k)[0] for k in ORDER]; e = [stat3(nat, k)[1] for k in ORDER]
    chk("estadísticas base", b == s["base"], f"{name}: decomp {s['base']} / pokeapi {b}")
    chk("EV que da", e == s["evYield"], f"{name}: decomp {s['evYield']} / pokeapi {e}")
    t = [TYPE(x) for x in dict.fromkeys(s["types"])]
    chk("tipos", t == types3(nat), f"{name}: decomp {t} / pokeapi {types3(nat)}")
    a = sorted(x for x in set(s["abilities"]) if x)
    chk("habilidades", a == ab3(nat), f"{name}: decomp {a} / pokeapi {ab3(nat)}")
    r = spc[nat]
    chk("ratio de captura", s["catchRate"] == int(r["capture_rate"]), f"{name}: {s['catchRate']} / {r['capture_rate']}")
    chk("amistad base", s["friendship"] == int(r["base_happiness"]), f"{name}: {s['friendship']} / {r['base_happiness']}")
    chk("ciclos de huevo", s["eggCycles"] == int(r["hatch_counter"]), f"{name}: {s['eggCycles']} / {r['hatch_counter']}")
    chk("ratio de género", GENDER.get(s["genderRatio"]) == int(r["gender_rate"]), f"{name}: {s['genderRatio']} / {r['gender_rate']}")
    chk("curva de experiencia", GROWTH[s["growthRate"]] == int(r["growth_rate_id"]), f"{name}: {s['growthRate']} / {r['growth_rate_id']}")
    chk("grupos huevo", set(s["eggGroups"]) == eggg[nat], f"{name}: {sorted(set(s['eggGroups']))} / {sorted(eggg[nat])}")
# ---- learnsets
pm = defaultdict(lambda: defaultdict(list))
for r in rows("pokemon_moves"):
    if int(r["version_group_id"]) == VG and int(r["pokemon_id"]) <= 386:
        pm[int(r["pokemon_id"])][int(r["pokemon_move_method_id"])].append((int(r["level"] or 0), int(r["move_id"])))
mach = {}
for r in rows("machines"):
    if int(r["version_group_id"]) == VG: mach[int(r["machine_number"])] = int(r["move_id"])
tm_moves = [mach[i] for i in range(1, 51)] + [mach[i] for i in range(101, 109)]
egg_by_idx = defaultdict(set); _cur = None
for v in sp["eggMoves"]:
    if v > 20000: _cur = v - 20000
    elif v != 0xFFFF and _cur is not None: egg_by_idx[_cur].add(v)
tutor_list = sp["tutorMoves"]
for nat, (idx, s) in sorted(by_nat.items()):
    name = spc[nat]["identifier"]
    a = Counter(map(tuple, s["learnset"])); b = Counter(pm[nat][1])
    chk("movimientos por nivel", a == b, f"{name}: solo decomp {sorted((a-b).elements())} / solo pokeapi {sorted((b-a).elements())}")
    bits = s["tmhm"][0] | (s["tmhm"][1] << 32)
    a = {tm_moves[i] for i in range(58) if bits >> i & 1}; b = {m for _, m in pm[nat][4]}
    chk("MT/MO compatibles", a == b, f"{name}: solo decomp {sorted(a-b)} / solo pokeapi {sorted(b-a)}")
    a = {tutor_list[i] for i in range(len(tutor_list)) if s["tutor"] >> i & 1}; b = {m for _, m in pm[nat][3]}
    chk("tutores", a == b, f"{name}: solo decomp {sorted(a-b)} / solo pokeapi {sorted(b-a)}")
    a = egg_by_idx.get(idx, set()); b = {m for _, m in pm[nat][2]}
    chk("movimientos huevo", a == b, f"{name}: solo decomp {sorted(a-b)} / solo pokeapi {sorted(b-a)}")
# ---- moves
cur = {int(r["id"]): r for r in rows("moves")}
chg = defaultdict(list)
for r in rows("move_changelog"): chg[int(r["move_id"])].append(r)
def move3(m):
    v = dict(cur[m]); done = set()
    for r in sorted(chg[m], key=lambda r: vg_order[int(r["changed_in_version_group_id"])]):
        if vg_order[int(r["changed_in_version_group_id"])] <= vg_order[VG]: continue
        for f in ("type_id", "power", "pp", "accuracy", "priority", "effect_chance"):
            if r[f] != "" and f not in done: v[f] = r[f]; done.add(f)
    return v
iv = lambda x: int(x) if x not in ("", None) else 0
for m in range(1, 355):
    d = mv[m]; p = move3(m); name = cur[m]["identifier"]
    chk("movimiento: tipo", TYPE(d["type"]) == iv(p["type_id"]), f"{name}: {TYPE(d['type'])} / {p['type_id']}")
    pw = iv(p["power"]); dp = d["power"]
    chk("movimiento: potencia", dp == pw or (dp == 1 and pw == 0), f"{name}: {dp} / {p['power'] or '—'}")
    chk("movimiento: precisión", d["accuracy"] == iv(p["accuracy"]), f"{name}: {d['accuracy']} / {p['accuracy'] or '—'}")
    chk("movimiento: PP", d["pp"] == iv(p["pp"]), f"{name}: {d['pp']} / {p['pp']}")
    pr = d["priority"] - 256 if d["priority"] > 127 else d["priority"]
    chk("movimiento: prioridad", pr == iv(p["priority"]), f"{name}: {pr} / {p['priority']}")
    chk("movimiento: prob. efecto", d["chance"] == iv(p["effect_chance"]), f"{name}: {d['chance']} / {p['effect_chance'] or '—'}")
print(f"{'categoría':28} {'comparados':>10} {'difieren':>9}")
for k, (n, bad) in out.items(): print(f"{k:28} {n:>10} {bad:>9}")
if args.out: json.dump(dict(ex), open(args.out, "w"), ensure_ascii=False, indent=1)
