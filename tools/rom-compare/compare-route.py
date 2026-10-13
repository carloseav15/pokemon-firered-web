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
            d["key"] = int(p[3][4:], 16) if len(p) > 3 else 0
            d["money"] = int(p[2], 16) ^ d["key"]
        elif p[0] == "PARTY":
            ev.setdefault(p[1], {})["count"] = int(p[2].split("=")[1])
        elif p[0] == "BAG":
            ev.setdefault(p[1], {})["bag"] = bytes.fromhex(p[2])
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
pairs = [(d["tag"], d) for d in port["mapDumps"]]
if "parcel" in port:
    pairs.append(("parcel", port["parcel"]))
pairs.append(("end", port["end"]))
if port.get("route2"):
    pairs.append(("route2", port["route2"]))
for tag, p in pairs:
    if tag in ("parcel", "end", "route2"):
        rtag = tag
    else:
        name, _, visit = tag.split(":", 1)[1].partition("#")
        num = consts[name]
        rtag = f"map:{num >> 8},{num & 255}#{visit or 1}"
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
    if "bag" in r and isinstance(p.get("bag"), dict):
        # key items (+0x3B8, 30 slots) and Poke Balls (+0x430, 13 slots): u16 id, u16 quantity ^ key low half
        raw, keylow = r["bag"], r.get("key", 0) & 0xFFFF
        slots = [struct.unpack_from("<HH", raw, i * 4) for i in range(len(raw) // 4)]
        rom_items = sorted((i, q ^ keylow) for i, q in slots if i)
        port_items = sorted((e["item"], e["quantity"]) for k in ("keyItems", "pokeBalls") for e in p["bag"].get(k, []) if e.get("item"))
        verdict = "same" if rom_items == port_items else "DIFFERENT"
        print(f"   bag (key items + balls, id:qty) ROM={rom_items} port={port_items} -> {verdict}")
