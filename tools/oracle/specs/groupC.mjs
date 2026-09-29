// Group C: first STATE ADAPTERS. RNG (module state observed through the bundle, not exported by production code)
// and a plain byte buffer (TS Uint8Array <-> wasm linear memory).
const fact = (text, ...refs) => ({ level: "fact", text, refs });
const assumed = (text, ...refs) => ({ level: "assumed", text, refs });

export default [
  {
    name: "SeedRng+Random", group: "C", kind: "rng", ret: "u16", params: [],
    observed: "Random() return value and internal 32-bit state after every call, for the same seed",
    c: { stem: "random", name: "Random", seedFn: "SeedRng", callFn: "Random", stateSymbol: "gRngValue" },
    impls: [
      { label: "random.ts", file: "src/fr/random.ts", name: "random", seedName: "seedRng", callName: "random", stateAlias: "seed", state: { seed: "seed" } },
      // the slot machine keeps its own local `Random` that should just forward to random.ts
      { label: "menus/slotMachine.ts:Random", file: "src/fr/menus/slotMachine.ts", callName: "Random",
        seedFile: "src/fr/random.ts", seedName: "seedRng", stateFile: "src/fr/random.ts", stateAlias: "seed" },
    ],
    tsExtra: [{ file: "src/fr/random.ts", name: "seedRng", state: { seed: "seed" } }],
    realisticEvidence: [fact("SeedRng takes a u16; the game seeds from a timer/trainer id and then only calls Random()", "random.c:15")],
    cost: { wrapper: "none for the function; internal state (`let seed`) read through an esbuild-appended accessor", state: "gRngValue (C global) <-> module `seed` (TS)",
      touchedTs: false, adapters: ["state accessor via bundle (__o_state_*)", "C data-symbol read"], reusable: "yes: any module-level `let` and any C global scalar" },
  },
  {
    name: "CalcCRC16", group: "C", kind: "buffer", ret: "u16",
    observed: "return value and whether the input buffer was modified",
    c: { stem: "util", name: "CalcCRC16" },
    params: [],
    impls: [{ label: "util.ts", file: "src/fr/util.ts", name: "CalcCRC16" }],
    realisticEvidence: [fact("only caller hashes mystery-event script data", "mystery_event_script.c:316"),
      assumed("lengths >= 65536 are excluded: the C loop counter `i` is a u16, so it never reaches such a length (infinite loop in C)")],
    cost: { wrapper: "none", state: "input buffer only", touchedTs: false, adapters: ["Uint8Array <-> wasm memory (heap base)"], reusable: "yes: any const u8* + length function" },
  },
];
