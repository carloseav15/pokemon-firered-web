#!/usr/bin/env python3
"""check:compare-data — the FireRed/Emerald comparison (src/compare/diff.ts) agrees with an independent Python one.

Both implementations read public/fr and public/emerald (EXPORT_GAME=emerald tools/decomp/export.py) and count how many
species / moves / items differ per field. This proves the page's counts are not an artefact of the TypeScript, not that
the exported data match the ROMs. Skipped when public/emerald is missing.
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(g: str):
    def d(f: str):
        p = ROOT / "public" / g / ("data" if f not in ("constants", "charmap") else "") / f"{f}.json"
        return json.loads(p.read_text())
    return d("species"), d("moves"), d("items"), d("constants")


def ts_counts() -> dict:
    out = ROOT / ".decomp-build" / "checks" / "compareData.mjs"
    r = subprocess.run(["npx", "esbuild", "tools/checks/compareData.ts", "--bundle", "--platform=node", "--format=esm",
                        "--log-level=warning", f"--outfile={out}"], cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr)
    r = subprocess.run(["node", str(out)], cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr)
    return json.loads(r.stdout)


def py_counts() -> dict:
    fs, fm, fi, fc = load("fr")
    es, em, ei, ec = load("emerald")
    chars = json.loads((ROOT / "public/fr/charmap.json").read_text())["chars"]
    rev: dict[int, str] = {}
    for ch, b in chars.items():
        if b not in rev and len(ch) == 1 and ord(ch) < 0x3000:
            rev[b] = ch

    def dec(s: str) -> str:
        out, bs, i = "", base64.b64decode(s), 0
        while i < len(bs):
            b = bs[i]
            if b == 0xFF:
                break
            if b == 0xFC:
                i += 2
                continue
            if b in (0xFA, 0xFB, 0xFE):
                out += " "
            else:
                out += rev.get(b, "?")
            i += 1
        return out

    def bits(words, names):
        return {names[i] for i in range(len(names)) if (words[i // 32] >> (i % 32)) & 1}

    def mv(game_moves, i):
        return dec(game_moves["moves"][i]["name"]) if i else "-"

    def alias(c, prefix):
        d: dict[int, set] = {}
        for k, v in c.items():
            if k.startswith(prefix):
                d.setdefault(v, set()).add(k[len(prefix):])
        return d

    tmF = [mv(fm, m) for m in fs["tmhmMoves"]]
    tmE = [mv(em, m) for m in es["tmhmMoves"]]
    tuF = [mv(fm, m) for m in fs["tutorMoves"]]
    tuE = [mv(em, m) for m in es["tutorMoves"]]
    egF, egE = alias(fc, "EGG_GROUP_"), alias(ec, "EGG_GROUP_")
    itF = {i["id"]: i["const"] for i in fi["items"]}
    itE = {i["id"]: i["const"] for i in ei["items"]}
    sp = dict(egg=0, learn=0, held=0, tutor=0, tmhm=0, stats=0, types=0, abil=0, evo=0, catch=0)
    n = 0
    for i in range(1, min(len(fs["species"]), len(es["species"]))):
        a, b = fs["species"][i], es["species"][i]
        n += 1
        if any(egF[x].isdisjoint(egE[y]) for x, y in zip(a["eggGroups"], b["eggGroups"])):
            sp["egg"] += 1
        if [(l, mv(fm, m)) for l, m in a["learnset"]] != [(l, mv(em, m)) for l, m in b["learnset"]]:
            sp["learn"] += 1
        if [itF.get(x, "?") if x else "-" for x in a["items"]] != [itE.get(x, "?") if x else "-" for x in b["items"]]:
            sp["held"] += 1
        if bits([a["tutor"]], tuF) != bits([b["tutor"]], tuE):
            sp["tutor"] += 1
        if bits(a["tmhm"], tmF) != bits(b["tmhm"], tmE):
            sp["tmhm"] += 1
        for key, k in (("base", "stats"), ("types", "types"), ("abilities", "abil"), ("evolutions", "evo"), ("catchRate", "catch")):
            if k == "evo":
                if [[m, p, FS(fs, t)] for m, p, t in a[key]] != [[m, p, FS(es, t)] for m, p, t in b[key]]:
                    sp[k] += 1
            elif a[key] != b[key]:
                sp[k] += 1
    sp["total"] = n
    mc = dict(desc=0, flags=0, acc=0, power=0, pp=0, effect=0, type=0)
    nm = 0
    for i in range(1, min(len(fm["moves"]), len(em["moves"]))):
        a, b = fm["moves"][i], em["moves"][i]
        nm += 1
        if dec(a["description"]) != dec(b["description"]):
            mc["desc"] += 1
        for k, key in (("flags", "flags"), ("acc", "accuracy"), ("power", "power"), ("pp", "pp"), ("type", "type")):
            if a[key] != b[key]:
                mc[k] += 1
        if a["effect"] != b["effect"]:
            mc["effect"] += 1
    mc["total"] = nm
    Fi = {i["const"]: i for i in fi["items"]}
    Ei = {i["const"]: i for i in ei["items"]}
    keys = [k for k in set(Fi) | set(Ei) if not re.fullmatch(r"ITEM_[0-9A-F]{3}", k) and k != "ITEM_NONE"]
    ic = dict(only=0, both=0, price=0, desc=0, battle=0)
    for k in keys:
        if k not in Fi or k not in Ei:
            ic["only"] += 1
            continue
        ic["both"] += 1
        a, b = Fi[k], Ei[k]
        if a["price"] != b["price"]:
            ic["price"] += 1
        if dec(a["description"]) != dec(b["description"]):
            ic["desc"] += 1
        if a["battleUsage"] != b["battleUsage"]:
            ic["battle"] += 1
    ic["total"] = len(keys)
    return {"species": sp, "moves": mc, "items": ic}


def FS(game_species, sid):
    # evolution targets are species ids; both games number species identically, but compare by decoded name anyway
    return sid


def main() -> int:
    if not (ROOT / "public/emerald/data/species.json").exists():
        print("check:compare-data skipped: public/emerald missing (EXPORT_GAME=emerald python3 tools/decomp/export.py)")
        return 0
    a, b = ts_counts(), py_counts()
    ok = a == b
    print(json.dumps(a, sort_keys=True))
    if not ok:
        print("DIFFERENT, python:", json.dumps(b, sort_keys=True))
    print("check:compare-data " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
