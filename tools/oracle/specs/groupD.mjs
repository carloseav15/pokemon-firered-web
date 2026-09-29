// Group D: functions whose state is a C struct mirrored by a binary-compatible TS ByteStruct.
// The struct definitions (per-struct cost) are the two `const` blocks; each function is one spec below them.
const P = (n, t, extra = {}) => ({ n, t, ...extra });
const fact = (text, ...refs) => ({ level: "fact", text, refs });
const assumed = (text, ...refs) => ({ level: "assumed", text, refs });

const GLOBALS = "src/fr/battle/globals.ts";
const STRUCTS = "src/fr/generated/structs.ts";
const protectStruct = { name: "gProtectStructs", ctype: "struct ProtectStruct", structName: "ProtectStruct", count: 4, tsFile: GLOBALS, tsClassFile: STRUCTS };
const battleStruct = { name: "gBattleStruct", ctype: "struct BattleStruct", structName: "BattleStruct", count: 1, pointer: true, tsFile: GLOBALS, tsClassFile: STRUCTS };
const expose = (s) => [{ file: s.tsFile, name: s.name }, { file: s.tsClassFile, name: s.structName }];

export default [
  {
    name: "WasUnableToUseMove", group: "D", kind: "struct", ret: "bool8",
    c: { stem: "battle_util", name: "WasUnableToUseMove" },
    params: [P("battler", "u8", { realistic: [0, 3], structural: true, extra: [3, 4, 5] })],
    structs: [protectStruct], tsExtra: expose(protectStruct),
    impls: [
      { label: "battle/util.ts", file: "src/fr/battle/util.ts", name: "WasUnableToUseMove" },
      // detector checks: each of these MUST be flagged (expect), they are not project code
      { label: "MUTANT ignores confusionSelfDmg", expect: "NEEDS_TRIAGE",
        build: (c) => { const g = c.ns.mods[c.abs(GLOBALS)].__o_gProtectStructs; return (b) => { const p = g[b];
          return !!(p.prlzImmobility || p.targetNotAffected || p.usedImprisonedMove || p.loveImmobility || p.usedDisabledMove || p.usedTauntedMove || p.flag2Unknown || p.flinchImmobility); }; } },
      { label: "MUTANT writes a byte", expect: "NEEDS_TRIAGE",
        build: (c) => { const g = c.ns.mods[c.abs(GLOBALS)].__o_gProtectStructs; return (b) => { g[b].bytes[12] ^= 1; return false; }; } },
    ],
    observed: "return value + all 64 bytes of gProtectStructs before/after",
    realisticEvidence: [
      fact("battler is a battler id 0..MAX_BATTLERS_COUNT-1", "battle_util.c:WasUnableToUseMove", "battle.h:MAX_BATTLERS_COUNT"),
      assumed("every flag bit is independently reachable; realistic state = C padding bytes zero (static storage, never written)"),
    ],
    cost: { wrapper: "none (function and global exported)", state: "gProtectStructs (4 x 16 bytes) copied as raw bytes", touchedTs: false,
      adapters: ["ByteStruct raw-byte adapter", "appendC global definition"], reusable: "yes" },
  },
  {
    name: "BtlCtrl_OakOldMan_SetState2Flag", group: "D", kind: "struct", ret: "void",
    c: { stem: "battle_controller_oak_old_man", name: "BtlCtrl_OakOldMan_SetState2Flag" },
    params: [P("mask", "u8", { realisticSet: [0x1, 0x2, 0x4, 0x8] })],
    structs: [battleStruct], tsExtra: expose(battleStruct),
    impls: [
      { label: "battle/controller_oak_old_man.ts", file: "src/fr/battle/controller_oak_old_man.ts", name: "BtlCtrl_OakOldMan_SetState2Flag" },
      { label: "MUTANT writes simulatedInputState[1]", expect: "NEEDS_TRIAGE",
        build: (c) => { const s = c.ns.mods[c.abs(GLOBALS)].__o_gBattleStruct; return (m) => { s.simulatedInputState[1] |= m; }; } },
      { label: "MUTANT also writes [3]", expect: "NEEDS_TRIAGE",
        build: (c) => { const s = c.ns.mods[c.abs(GLOBALS)].__o_gBattleStruct; return (m) => { s.simulatedInputState[2] |= m; s.simulatedInputState[3] |= m; }; } },
    ],
    observed: "all 512 bytes of *gBattleStruct before/after (writes simulatedInputState[2])",
    realisticEvidence: [fact("masks are FIRST_BATTLE_MSG_FLAG_* = 1, 2, 4, 8", "battle_controllers.h:287-293")],
    cost: { wrapper: "none", state: "*gBattleStruct (512 bytes; C pointer global initialised by an appended function)", touchedTs: false,
      adapters: ["ByteStruct raw-byte adapter", "pointer-to-struct global init"], reusable: "yes" },
  },
  {
    name: "BtlCtrl_OakOldMan_TestState2Flag", group: "D", kind: "struct", ret: "bool8",
    c: { stem: "battle_controller_oak_old_man", name: "BtlCtrl_OakOldMan_TestState2Flag" },
    params: [P("mask", "u8", { realisticSet: [0x1, 0x2, 0x4, 0x8] })],
    structs: [battleStruct], tsExtra: expose(battleStruct),
    impls: [{ label: "battle/controller_oak_old_man.ts", file: "src/fr/battle/controller_oak_old_man.ts", name: "BtlCtrl_OakOldMan_TestState2Flag" }],
    observed: "return value + all 512 bytes of *gBattleStruct",
    realisticEvidence: [fact("masks are FIRST_BATTLE_MSG_FLAG_* = 1, 2, 4, 8", "battle_controllers.h:287-293")],
    cost: { wrapper: "none", state: "*gBattleStruct", touchedTs: false, adapters: ["ByteStruct raw-byte adapter (already built)"], reusable: "yes" },
  },
];
