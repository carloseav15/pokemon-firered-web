#!/usr/bin/env python3
"""Compare the ROM report of rival.lua with the port report of port-rival.mjs, event by event.

Usage: compare-rival.py [/tmp/rom-rival.txt] [/tmp/port-rival.json]
Flags/vars are compared by index; the port's flags are bytes (same layout as SaveBlock1 +0xEE0) and vars are
u16 words from VARS_START (0x4000). Party mon0 is decoded from the encrypted 100-byte Pokemon struct
(pokemon.h: personality, otId, nickname[10], ..., 4 substructs of 12 bytes at +0x20 XOR (personality ^ otId),
order by personality % 24; level +0x54, hp +0x56, maxHP +0x58).
"""
import json
import struct
import sys
from itertools import permutations

ORDERS = list(permutations("GAEM"))  # sub-structure order table, index = personality % 24

rom_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rom-rival.txt"
port_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/port-rival.json"


def decode_mon(raw: bytes):
    if not any(raw):
        return None
    pid, oid = struct.unpack_from("<II", raw, 0)
    key = pid ^ oid
    data = bytearray(raw[0x20:0x50])
    for i in range(0, 48, 4):
        (word,) = struct.unpack_from("<I", data, i)
        struct.pack_into("<I", data, i, word ^ key)
    order = ORDERS[pid % 24]
    sub = {name: bytes(data[i * 12:(i + 1) * 12]) for i, name in enumerate(order)}
    species, item, exp = struct.unpack_from("<HHI", sub["G"], 0)
    moves = list(struct.unpack_from("<4H", sub["A"], 0))
    pp = list(sub["A"][8:12])
    level, _, hp, max_hp = struct.unpack_from("<BBHH", raw, 0x54)
    return {"personality": pid, "otId": oid, "species": species, "heldItem": item, "exp": exp,
            "moves": moves, "pp": pp, "level": level, "hp": hp, "maxHP": max_hp}


def parse_rom(path):
    ev, cur = {}, None
    for line in open(path):
        parts = line.split()
        if not parts:
            continue
        kind = parts[0]
        if kind == "DUMP":
            tag = parts[1]
            cur = ev.setdefault(tag, {})
            for kv in parts[2:]:
                k, v = kv.split("=", 1)
                cur[k] = v
        elif kind in ("FLAGS", "VARS"):
            ev.setdefault(parts[1], {})[kind.lower()] = bytes.fromhex(parts[2])
        elif kind == "MONEY":
            d = ev.setdefault(parts[1], {})
            d["money"] = int(parts[2], 16)
            if len(parts) > 3 and parts[3].startswith("key="):
                d["money"] ^= int(parts[3][4:], 16)
        elif kind == "PARTY":
            ev.setdefault(parts[1], {})["count"] = int(parts[2].split("=")[1])
            ev[parts[1]]["mon0"] = decode_mon(bytes.fromhex(parts[3].split("=")[1]))
        elif kind == "ENEMY":
            ev.setdefault(parts[1], {})["enemy0"] = decode_mon(bytes.fromhex(parts[2].split("=")[1]))
    return ev


def diff_bits(a: bytes, b: list[int]):
    out = []
    for i in range(min(len(a), len(b))):
        x = a[i] ^ (b[i] & 0xFF)
        for bit in range(8):
            if x >> bit & 1:
                out.append((i * 8 + bit, bool(a[i] >> bit & 1)))
    return out


def diff_vars(a: bytes, b: list[int]):
    out = []
    for i in range(min(len(a) // 2, len(b))):
        (r,) = struct.unpack_from("<H", a, i * 2)
        if r != (b[i] & 0xFFFF):
            out.append((0x4000 + i, r, b[i] & 0xFFFF))
    return out


rom = parse_rom(rom_path)
port = json.load(open(port_path))["dumps"]
pairs = [("starter-chosen", "starterChosen"), ("afterpick", "afterpick"), ("battle-start", "battleStart"),
         ("battle-end", "battleEnd"), ("final", "final")]
for rtag, ptag in pairs:
    r, p = rom.get(rtag), port.get(ptag)
    print(f"== {rtag}")
    if not r or not p:
        print("   missing:", "ROM" if not r else "", "port" if not p else "")
        continue
    pos = r.get("pos", "?")
    print(f"   ROM  pos={pos} map={r.get('map')} scene={r.get('scene')} money={r.get('money')} party={r.get('count')} rng={r.get('rng')}")
    print(f"   port pos={p['st']['x']},{p['st']['y']} map={p['st']['map']} scene={p['scene']} money={p['money']} party={p['partyCount']}")
    fd = diff_bits(r["flags"], p["flags"])
    vd = diff_vars(r["vars"], p["vars"])
    print(f"   flags differing: {len(fd)} " + ", ".join(f"0x{i:03x}(rom={int(v)})" for i, v in fd[:20]))
    print(f"   vars differing:  {len(vd)} " + ", ".join(f"0x{i:04x}(rom={a} port={b})" for i, a, b in vd[:20]))
    m, q = r.get("mon0"), p.get("mon0")
    if m and q:
        print(f"   mon0 ROM  sp={m['species']} L{m['level']} hp={m['hp']}/{m['maxHP']} moves={m['moves']} pp={m['pp']}")
        print(f"   mon0 port sp={q['species']} L{q['level']} hp={q['hp']}/{q.get('stats', [None])[0] if q.get('stats') else q.get('maxHP')} moves={q['moves']} pp={q.get('pp')}")
    e, f = r.get("enemy0"), p.get("enemy0")
    if e and e["species"]:
        print(f"   enemy ROM  sp={e['species']} L{e['level']} hp={e['hp']}/{e['maxHP']} moves={e['moves']} pp={e['pp']}")
    if f:
        stats = f.get("stats") or []
        print(f"   enemy port sp={f['species']} L{f['level']} hp={f['hp']}/{stats[0] if stats else f.get('maxHP')} moves={f['moves']} pp={f.get('pp')}")
