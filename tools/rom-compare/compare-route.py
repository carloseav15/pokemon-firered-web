#!/usr/bin/env python3
"""Compare parcel.lua (ROM) with port-parcel.mjs (port) at every map change and at the end of the Mart scene.

Usage: compare-route.py [/tmp/rom-parcel.txt] [/tmp/port-parcel.json]
Flags are bits (SaveBlock1 +0xEE0 layout), vars u16 from 0x4000; money is decoded with SaveBlock2+0xF20.
"""
import json, struct, sys

rom_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rom-parcel.txt"
port_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/port-parcel.json"
consts = json.load(open("public/fr/constants.json"))
consts = consts.get("constants", consts)
NAME = {v: k for k, v in consts.items() if k.startswith("MAP_") and isinstance(v, int)}


def parse_rom(path):
    ev = {}
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == "DUMP":
            d = ev.setdefault(p[1], {})
            for kv in p[2:]:
                k, v = kv.split("=", 1)
                d[k] = v
        elif p[0] in ("FLAGS", "VARS"):
            ev.setdefault(p[1], {})[p[0].lower()] = bytes.fromhex(p[2])
        elif p[0] == "MONEY":
            d = ev.setdefault(p[1], {})
            d["money"] = int(p[2], 16) ^ (int(p[3][4:], 16) if len(p) > 3 else 0)
        elif p[0] == "PARTY":
            ev.setdefault(p[1], {})["count"] = int(p[2].split("=")[1])
    return ev


def bits(a, b):
    out = []
    for i in range(min(len(a), len(b))):
        x = a[i] ^ (b[i] & 0xFF)
        for bit in range(8):
            if x >> bit & 1:
                out.append((i * 8 + bit, bool(a[i] >> bit & 1)))
    return out


def words(a, b):
    out = []
    for i in range(min(len(a) // 2, len(b))):
        (r,) = struct.unpack_from("<H", a, i * 2)
        if r != (b[i] & 0xFFFF):
            out.append((0x4000 + i, r, b[i] & 0xFFFF))
    return out


def label(kind, ident):
    names = {v: k for k, v in consts.items() if k.startswith(kind) and isinstance(v, int)}
    return names.get(ident, hex(ident))


rom = parse_rom(rom_path)
port = json.load(open(port_path))
pairs = []
for d in port["mapDumps"]:
    pairs.append((d["tag"], d))
pairs.append(("end", port["end"]))
for tag, p in pairs:
    if tag == "end":
        rtag = "end"
    else:
        num = consts[tag.split(":", 1)[1]]
        rtag = f"map:{num >> 8},{num & 255}"
    r = rom.get(rtag)
    print(f"== {tag}  (ROM {rtag})")
    if not r:
        print("   ROM dump missing")
        continue
    print(f"   ROM  pos={r.get('pos')} money={r.get('money')} party={r.get('count')}")
    print(f"   port pos={p['st']['x']},{p['st']['y']} money={p['money']} party={p['partyCount']}")
    fd, vd = bits(r["flags"], p["flags"]), words(r["vars"], p["vars"])
    print(f"   flags differing: {len(fd)} " + ", ".join(f"{label('FLAG_', i)}(rom={int(v)})" for i, v in fd[:25]))
    print(f"   vars differing:  {len(vd)} " + ", ".join(f"{label('VAR_', i)}(rom={a} port={b})" for i, a, b in vd[:25]))
