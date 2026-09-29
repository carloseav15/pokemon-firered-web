// Group A: DIRECT functions (exported TS, scalar arguments, same arity as the C).
// realistic ranges carry evidence; `assumed` means "not proven from callers".
import { readFileSync } from "node:fs";
import path from "node:path";

const P = (n, t, extra = {}) => ({ n, t, ...extra });
const fact = (text, ...refs) => ({ level: "fact", text, refs });
const assumed = (text, ...refs) => ({ level: "assumed", text, refs });
const NO = { wrapper: "none", state: "none", touchedTs: false };
const speciesJson = (ctx) => JSON.parse(readFileSync(path.join(ctx.ROOT, "public/fr/data/species.json"), "utf8"));

export default [
  {
    name: "Sin", group: "A", kind: "pure", ret: "s16",
    c: { stem: "trig", name: "Sin" },
    params: [P("index", "s16", { realistic: [0, 255], structural: true }), P("amplitude", "s16", { realistic: [-256, 255] })],
    impls: [{ label: "hw/trig.ts", file: "src/fr/hw/trig.ts", name: "Sin" }],
    realisticEvidence: [
      fact("callers pass sprite->data[] (s16) as index; the table has 320 entries (index 0..255 plus the +64 Cos offset)", "battle_anim_dragon.c:281", "trig.c:4"),
      assumed("amplitude is a pixel amplitude; -256..255 is assumed, no caller audit"),
    ],
    async setup(ctx) { // TS table is filled from the exported cdata at startup (same as the game does)
      const defs = JSON.parse(readFileSync(path.join(ctx.ROOT, "public/fr/cdata/trig.json"), "utf8")).defs;
      ctx.assets.registerCData("trig", defs);
      ctx.ns.mods[ctx.abs("src/fr/hw/trig.ts")].initTrig();
    },
    dataChecks: [{ label: "gSineTable", cSymbol: "gSineTable", stride: 2, type: "s16",
      ts: (ctx) => Array.from(ctx.ns.mods[ctx.abs("src/fr/hw/trig.ts")].gSineTable) }],
    cost: { ...NO, adapters: ["cdata registration (setup)"], reusable: "setup hook pattern" },
  },
  {
    name: "GetTileMapIndexFromCoords", group: "A", kind: "pure", ret: "u32",
    c: { stem: "bg", name: "GetTileMapIndexFromCoords" },
    params: [P("x", "s32", { realistic: [0, 63] }), P("y", "s32", { realistic: [0, 63] }), P("screenSize", "s32", { realistic: [0, 3], structural: true }),
      P("screenWidth", "u32", { realisticSet: [32, 64], structural: true }), P("screenHeight", "u32", { realisticSet: [32, 64], structural: true })],
    impls: [{ label: "hw/bg.ts", file: "src/fr/hw/bg.ts", name: "GetTileMapIndexFromCoords" }],
    realisticEvidence: [
      assumed("tilemap coordinates 0..63 and BG sizes 32/64 tiles; callers bg.c:933/1017 not audited for the exact ranges"),
      fact("screenSize is the 2-bit BG size field (0..3)", "bg.c:1118"),
    ],
    cost: { ...NO, adapters: [], reusable: "n/a" },
  },
  {
    name: "CountTrailingZeroBits", group: "A", kind: "pure", ret: "s32",
    c: { stem: "util", name: "CountTrailingZeroBits" },
    params: [P("value", "u32", { realistic: [0, 15] })],
    impls: [{ label: "util.ts", file: "src/fr/util.ts", name: "CountTrailingZeroBits" }],
    realisticEvidence: [fact("only caller passes (status2 & STATUS2_INFATUATION) >> 16, a 4-bit value", "battle_util.c:1466", "constants/battle.h:118")],
    cost: { ...NO, adapters: [], reusable: "n/a" },
  },
  {
    name: "CalculatePanIncrement", group: "A", kind: "pure", ret: "s16",
    c: { stem: "battle_anim", name: "CalculatePanIncrement" },
    params: [P("sourcePan", "s16", { realistic: [-64, 63] }), P("targetPan", "s16", { realistic: [-64, 63] }), P("incrementPan", "s16", { realistic: [-16, 16] })],
    impls: [{ label: "battle/animScript.ts", file: "src/fr/battle/animScript.ts", name: "CalculatePanIncrement" }],
    realisticEvidence: [fact("pans are SOUND_PAN_ATTACKER..SOUND_PAN_TARGET (-64..63)", "constants/battle_anim.h:317"),
      assumed("increment magnitude within -16..16 (callers pass 2 or an animation argument)", "battle_anim_sound_tasks.c:31")],
    cost: { ...NO, adapters: [], reusable: "n/a" },
  },
  {
    name: "IsShinyOtIdPersonality", group: "A", kind: "pure", ret: "bool8",
    c: { stem: "pokemon", name: "IsShinyOtIdPersonality", unstatic: ["IsShinyOtIdPersonality"] },
    params: [P("otId", "u32", { realistic: [0, 4294967295] }), P("personality", "u32", { realistic: [0, 4294967295] })],
    impls: [{ label: "pokemon/mon.ts", file: "src/fr/pokemon/mon.ts", name: "IsShinyOtIdPersonality" }],
    realisticEvidence: [fact("trainer IDs and personalities are arbitrary 32-bit values", "pokemon.c:6059")],
    cost: { wrapper: "unstatic (static in C)", state: "none", touchedTs: false, adapters: ["unstatic in C TU"], reusable: "unstatic list" },
  },
  {
    name: "ExtractMetatileAttribute", group: "A", kind: "pure", ret: "u32",
    c: { stem: "fieldmap", name: "ExtractMetatileAttribute" },
    params: [P("attributes", "u32", { realistic: [0, 4294967295] }), P("attributeType", "u8", { realisticSet: [0, 1, 2, 3, 4, 0xff], structural: true })],
    impls: [{ label: "field/fieldmap.ts", file: "src/fr/field/fieldmap.ts", name: "ExtractMetatileAttribute" }],
    realisticEvidence: [assumed("attributeType is one of the METATILE_ATTRIBUTE_* selectors or ALL; exact set not enumerated from constants", "wild_encounter.c:366")],
    cost: { ...NO, adapters: [], reusable: "n/a" },
  },
  {
    name: "GetHPBarLevel", group: "A", kind: "pure", ret: "u8",
    c: { stem: "battle_interface", name: "GetHPBarLevel" },
    params: [P("hp", "s16", { realistic: [0, 999] }), P("maxhp", "s16", { realistic: [1, 999] })],
    impls: [{ label: "battle/interface.ts", file: "src/fr/battle/interface.ts", name: "GetHPBarLevel" }],
    realisticEvidence: [assumed("HP values are non-negative and at most 999; hp <= maxhp is NOT enforced here (superset)", "party_menu.c:2423")],
    cost: { ...NO, adapters: [], reusable: "n/a" },
  },
  {
    name: "GetGenderFromSpeciesAndPersonality", group: "A", kind: "pure", ret: "u8",
    c: { stem: "pokemon", name: "GetGenderFromSpeciesAndPersonality",
      appendC: "unsigned __oracle_species_stride(void){return sizeof(gSpeciesInfo[0]);}\nunsigned __oracle_species_gender_off(void){return (unsigned)(unsigned long)&((struct SpeciesInfo*)0)->genderRatio;}" },
    params: [P("species", "u16", { realistic: [0, 411], structural: true }), P("personality", "u32", { realistic: [0, 4294967295] })],
    impls: [{ label: "pokemon/mon.ts", file: "src/fr/pokemon/mon.ts", name: "GetGenderFromSpeciesAndPersonality" }],
    realisticEvidence: [fact("species index into gSpeciesInfo: 0..NUM_SPECIES-1 (412 entries)", "constants/species.h:423"),
      fact("personality is an arbitrary u32", "battle_util.c:2074")],
    async setup(ctx) { ctx.rom.species = speciesJson(ctx).species; },
    dataChecks: [{ label: "gSpeciesInfo.genderRatio", cSymbol: "gSpeciesInfo", strideFn: "__oracle_species_stride",
      offsetFn: "__oracle_species_gender_off", type: "u8", ts: (ctx) => ctx.rom.species.slice(0, 412).map((s) => s.genderRatio) }],
    cost: { wrapper: "rom.species loaded in setup; sizeof/offsetof helper appended to the C TU", state: "rom.species (data)", touchedTs: false,
      adapters: ["rom data load", "appendC offsetof helper"], reusable: "data-check helper (table stride/offset)" },
  },
];
