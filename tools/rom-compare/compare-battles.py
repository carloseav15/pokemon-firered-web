#!/usr/bin/env python3
"""Compare the battle logs of parcel.lua (BSTART/BHP/BEND lines) and port-parcel.mjs (port.json "battles").

Usage: compare-battles.py rom.txt port.json
Each battle is the sequence of (player party HP | enemy party HP) states; frame counts are ignored (the ROM lags).
The first differing state of each battle is printed, with a few states of context on both sides.
"""
import json, sys


def rom_battles(path):
    out, cur = [], None
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == "BSTART":
            kv = dict(x.split("=", 1) for x in p[2:])
            cur = {"start": (kv["P"], kv["E"]), "states": []}
            out.append(cur)
        elif p[0] == "BHP" and cur is not None:
            rest = " ".join(p[2:])
            pl, _, en = rest.partition(" | ")
            cur["states"].append((pl.strip(), en.strip()))
        elif p[0] == "BEND" and cur is not None:
            kv = dict(x.split("=", 1) for x in p[2:])
            cur["end"] = (kv["P"], kv["E"])
            cur = None
    return out


def port_battles(path):
    out, cur = [], None
    for e in json.load(open(path)).get("battles") or []:
        if e["ev"] == "BSTART":
            cur = {"start": (e["P"], e["E"]), "states": []}
            out.append(cur)
        elif e["ev"] == "BHP" and cur is not None:
            cur["states"].append((e["P"], e["E"]))
        elif e["ev"] == "BEND" and cur is not None:
            cur["end"] = (e["P"], e["E"])
            cur = None
    return out


def dedupe(states):
    r = []
    for s in states:
        if not r or r[-1] != s:
            r.append(s)
    return r


rom, port = rom_battles(sys.argv[1]), port_battles(sys.argv[2])
print(f"battles: ROM {len(rom)}  port {len(port)}")
for i in range(max(len(rom), len(port))):
    r = rom[i] if i < len(rom) else None
    p = port[i] if i < len(port) else None
    print(f"== battle {i + 1}")
    if not r or not p:
        print("   only on", "ROM" if r else "port", (r or p)["start"])
        continue
    print(f"   start ROM  P={r['start'][0]}  E={r['start'][1]}")
    print(f"   start port P={p['start'][0]}  E={p['start'][1]}  -> {'same' if r['start'] == p['start'] else 'DIFFERENT'}")
    rs, ps = dedupe(r["states"]), dedupe(p["states"])
    first = next((k for k in range(min(len(rs), len(ps))) if rs[k] != ps[k]), None)
    if first is None and len(rs) == len(ps):
        print(f"   {len(rs)} HP states: identical; end ROM {r.get('end')} port {p.get('end')}")
        continue
    k = first if first is not None else min(len(rs), len(ps))
    print(f"   HP states: ROM {len(rs)} port {len(ps)}; first difference at state {k + 1}")
    for j in range(max(0, k - 2), k + 3):
        print(f"   [{j + 1}] ROM  {rs[j] if j < len(rs) else '-'}")
        print(f"   [{j + 1}] port {ps[j] if j < len(ps) else '-'}")
    print(f"   end ROM {r.get('end')}  port {p.get('end')}")
