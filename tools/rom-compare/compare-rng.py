"""Compare the LCG chains of a ROM trace (trace.lua) and a port trace (port-title-trace.mjs).

Usage: python3 tools/rom-compare/compare-rng.py ROM_TRACE PORT_TRACE [SEED=0x3649]

Both traces are aligned at the frame where the RNG is seeded (the first state that is not one
LCG step from the previous one, after frame 300). From there each state is reduced to its index
in the chain that starts at SEED, so equal indexes mean the same number of Random() calls.
"""
import sys

M, ADD = 0x41C64E6D, 0x6073


def load(path):
    return [l.split() for l in open(path)]


def seed_row(rows, state_col, after):
    last = None
    for i, r in enumerate(rows):
        v = int(r[state_col], 16)
        if last is not None and i > after and ((last * M + ADD) & 0xFFFFFFFF) != v:
            return i
        last = v
    raise SystemExit("no seeding event found")


def chain_index(state, seed, limit=6000):
    x = seed
    for k in range(limit):
        if x == state:
            return k
        x = (x * M + ADD) & 0xFFFFFFFF
    return None


def main():
    rom_path, port_path = sys.argv[1:3]
    seed = int(sys.argv[3], 0) if len(sys.argv) > 3 else 0x3649
    rom, port = load(rom_path), load(port_path)
    rs, ps = seed_row(rom, 2, 300), seed_row(port, 2, 300)
    n = min(len(rom) - rs, len(port) - ps)
    diffs = []
    for i in range(n):
        a = chain_index(int(rom[rs + i][2], 16), seed)
        b = chain_index(int(port[ps + i][2], 16), seed)
        if a != b:
            diffs.append((i, a, b))
    print(f"seed frame: ROM {rs}, port {ps}; compared {n} frames after the seed")
    print("identical" if not diffs else f"{len(diffs)} differing frames, first: {diffs[:5]}")


main()
