// Group E: scalar battle globals (plus ByteStruct state where the function has it).
// A global is one descriptor (name, C type, TS accessor expression, domains); the harness defines the C global, writes
// the same value to both sides, and compares the value each side holds afterwards.
import { readFileSync } from "node:fs";
import path from "node:path";

const P = (n, t, extra = {}) => ({ n, t, ...extra });
const fact = (text, ...refs) => ({ level: "fact", text, refs });
const assumed = (text, ...refs) => ({ level: "assumed", text, refs });
const GLB = "src/fr/battle/globals.ts";
const STRUCTS = "src/fr/generated/structs.ts";
const G = (name, type, extra = {}) => ({ name, type, ts: { file: GLB, expr: `G.${name}` }, ...extra });

const flags = G("gBattleTypeFlags", "u32", { realistic: [0, 0xfffff] });
const activeBattler = G("gActiveBattler", "u8", { realistic: [0, 3] });
const battlersCount = G("gBattlersCount", "u8", { realistic: [0, 4], structural: true, typeCap: [0, 8] });
const lastAbility = G("gLastUsedAbility", "u8", { realistic: [0, 77] });
const attacker = G("gBattlerAttacker", "u8", { realistic: [0, 3], structural: true });
const partyIdx = { name: "gBattlerPartyIndexes", type: "u16", count: 4, ts: { file: GLB, name: "gBattlerPartyIndexes" }, realistic: [0, 5] };
const specialStatuses = { name: "gSpecialStatuses", ctype: "struct SpecialStatus", structName: "SpecialStatus", count: 4, tsFile: GLB, tsClassFile: STRUCTS };
const battleStruct = { name: "gBattleStruct", ctype: "struct BattleStruct", structName: "BattleStruct", count: 1, pointer: true, tsFile: GLB, tsClassFile: STRUCTS };
const expose = (s) => [{ file: s.tsFile, name: s.name }, { file: s.tsClassFile, name: s.structName }];
const tsG = (c) => c.ns.mods[c.abs(GLB)].G;
const NO_TS_CHANGE = { touchedTs: false };
const FLAGS_EVIDENCE = fact("gBattleTypeFlags is an OR of BATTLE_TYPE_* bits 0..19", "constants/battle.h:47-67");
const species = (ctx) => JSON.parse(readFileSync(path.join(ctx.ROOT, "public/fr/data/species.json"), "utf8")).species;

export default [
  {
    name: "IsDoubleBattle", group: "E", kind: "struct", ret: "bool8", params: [],
    c: { stem: "battle_anim_mons", name: "IsDoubleBattle" },
    globals: [flags],
    impls: [
      { label: "battle/animScript.ts", file: "src/fr/battle/animScript.ts", name: "IsDoubleBattle" },
      { label: "MUTANT reads the wrong bit", expect: "NEEDS_TRIAGE", build: (c) => () => (tsG(c).gBattleTypeFlags & 2) !== 0 },
    ],
    observed: "return value + gBattleTypeFlags before/after",
    realisticEvidence: [FLAGS_EVIDENCE],
    cost: { wrapper: "expose non-exported TS fn", state: "1 global (read)", ...NO_TS_CHANGE, adapters: ["scalar global adapter"], reusable: "yes" },
  },
  {
    name: "IsMultiBattle", group: "E", kind: "struct", ret: "bool8", params: [],
    c: { stem: "party_menu", name: "IsMultiBattle" },
    globals: [flags],
    impls: [
      { label: "partyMenu.ts", file: "src/fr/partyMenu.ts", name: "IsMultiBattle" },
      { label: "MUTANT resets the global (bad init)", expect: "NEEDS_TRIAGE", build: (c) => () => { tsG(c).gBattleTypeFlags = 0; return false; } },
    ],
    observed: "return value + gBattleTypeFlags before/after",
    realisticEvidence: [FLAGS_EVIDENCE],
    cost: { wrapper: "none", state: "1 global (read); reuses the descriptor above", ...NO_TS_CHANGE, adapters: ["scalar global adapter"], reusable: "yes" },
  },
  {
    name: "GetAbilityBySpecies", group: "E", kind: "struct", ret: "u8",
    c: { stem: "pokemon", name: "GetAbilityBySpecies",
      appendC: "unsigned __oracle_species_stride(void){return sizeof(gSpeciesInfo[0]);}\nunsigned __oracle_species_abil_off(void){return (unsigned)(unsigned long)&((struct SpeciesInfo*)0)->abilities;}" },
    params: [P("species", "u16", { realistic: [0, 411], structural: true }), P("abilityNum", "bool8", { realistic: [0, 1], extra: [2, 255] })],
    globals: [lastAbility],
    impls: [
      { label: "battle/util.ts", file: "src/fr/battle/util.ts", name: "GetAbilityBySpecies" },
      { label: "MUTANT does not write the global", expect: "NEEDS_TRIAGE",
        build: (c) => (sp, n) => { const a = c.rom.species[sp]?.abilities ?? [0, 0]; return n ? a[1] : a[0]; } },
      { label: "MUTANT writes the wrong global", expect: "NEEDS_TRIAGE",
        build: (c) => (sp, n) => { const a = c.rom.species[sp]?.abilities ?? [0, 0]; const v = n ? a[1] : a[0]; tsG(c).gBattlerTarget = v; return v; } },
    ],
    async setup(ctx) { ctx.rom.species = species(ctx); },
    dataChecks: [0, 1].map((i) => ({ label: `gSpeciesInfo.abilities[${i}]`, cSymbol: "gSpeciesInfo", strideFn: "__oracle_species_stride",
      offsetFn: "__oracle_species_abil_off", offsetPlus: i, type: "u8", ts: (ctx) => ctx.rom.species.slice(0, 412).map((s) => s.abilities[i]) })),
    observed: "return value + gLastUsedAbility before/after; gSpeciesInfo.abilities table",
    realisticEvidence: [fact("species index into gSpeciesInfo (412 entries); abilityNum is a bool8", "constants/species.h:423")],
    cost: { wrapper: "rom.species loaded in setup; offsetof helper appended", state: "1 global (write) + const table", ...NO_TS_CHANGE, adapters: ["scalar global adapter", "data-check"], reusable: "yes" },
  },
  {
    name: "SpecialStatusesClear", group: "E", kind: "struct", ret: "void", params: [],
    c: { stem: "battle_main", name: "SpecialStatusesClear", unstatic: ["SpecialStatusesClear"] },
    globals: [activeBattler, battlersCount], structs: [specialStatuses], tsExtra: expose(specialStatuses),
    impls: [
      { label: "battle/main.ts", file: "src/fr/battle/main.ts", name: "SpecialStatusesClear" },
      { label: "MUTANT wrong final gActiveBattler (no wrap)", expect: "NEEDS_TRIAGE",
        build: (c) => () => { const g = tsG(c), s = c.ns.mods[c.abs(GLB)].__o_gSpecialStatuses; for (g.gActiveBattler = 0; g.gActiveBattler < g.gBattlersCount; g.gActiveBattler++) s[g.gActiveBattler].clear(); g.gActiveBattler += 256; } },
      { label: "MUTANT skips the last battler", expect: "NEEDS_TRIAGE",
        build: (c) => () => { const g = tsG(c), s = c.ns.mods[c.abs(GLB)].__o_gSpecialStatuses; for (g.gActiveBattler = 0; g.gActiveBattler < g.gBattlersCount - 1; g.gActiveBattler++) s[g.gActiveBattler].clear(); g.gActiveBattler = Math.max(0, g.gBattlersCount - 1); } },
    ],
    observed: "gActiveBattler (loop variable left behind), gBattlersCount, all 80 bytes of gSpecialStatuses",
    realisticEvidence: [fact("gBattlersCount is 1..4 (MAX_BATTLERS_COUNT = 4)", "battle.h"), assumed("0 is included as a degenerate count")],
    cost: { wrapper: "unstatic + expose", state: "2 globals (one read, one loop variable written) + 1 ByteStruct array", ...NO_TS_CHANGE, adapters: ["scalar global adapter", "ByteStruct adapter"], reusable: "yes" },
  },
  {
    name: "IsMonGettingExpSentOut", group: "E", kind: "struct", ret: "bool32", params: [],
    c: { stem: "battle_script_commands", name: "IsMonGettingExpSentOut" },
    globals: [flags, partyIdx], structs: [battleStruct], tsExtra: expose(battleStruct),
    impls: [{ label: "battle/cmds/part3.ts", file: "src/fr/battle/cmds/part3.ts", name: "IsMonGettingExpSentOut" }],
    observed: "return value + 2 globals + all 512 bytes of *gBattleStruct",
    realisticEvidence: [FLAGS_EVIDENCE, assumed("party indexes 0..5 (PARTY_SIZE); expGetterMonId comes from the ByteStruct state (any byte)")],
    cost: { wrapper: "none", state: "gBattleTypeFlags + 4-element u16 array + *gBattleStruct", ...NO_TS_CHANGE, adapters: ["scalar global adapter (array)", "ByteStruct adapter"], reusable: "yes" },
  },
  {
    name: "Cmd_endselectionscript", group: "E", kind: "struct", ret: "void", params: [],
    c: { stem: "battle_script_commands", name: "Cmd_endselectionscript", unstatic: ["Cmd_endselectionscript"] },
    globals: [attacker], structs: [battleStruct], tsExtra: expose(battleStruct),
    impls: [{ label: "battle/cmds/part2.ts", file: "src/fr/battle/cmds/part2.ts", name: "Cmd_endselectionscript" }],
    observed: "gBattlerAttacker and all 512 bytes of *gBattleStruct (writes selectionScriptFinished[gBattlerAttacker])",
    realisticEvidence: [fact("gBattlerAttacker is a battler id 0..3", "battle.h")],
    cost: { wrapper: "unstatic (C)", state: "gBattlerAttacker (index) + *gBattleStruct", ...NO_TS_CHANGE, adapters: ["scalar global adapter", "ByteStruct adapter"], reusable: "yes" },
  },
];
