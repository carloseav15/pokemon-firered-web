// Group B: WRAPPER functions (TS not exported and/or C static). The oracle exposes them at bundle time
// (esbuild plugin) and by dropping `static` in the preprocessed C copy; neither src/fr nor src/*.c is edited.
import { readFileSync } from "node:fs";
import path from "node:path";

const P = (n, t, extra = {}) => ({ n, t, ...extra });
const fact = (text, ...refs) => ({ level: "fact", text, refs });
const assumed = (text, ...refs) => ({ level: "assumed", text, refs });
const json = (ctx, f) => JSON.parse(readFileSync(path.join(ctx.ROOT, "public/fr", f), "utf8"));

export default [
  {
    name: "GetScaledHPFraction", group: "B", kind: "pure", ret: "u8", pairCompare: true, extraDomains: ["call"],
    c: { stem: "battle_interface", name: "GetScaledHPFraction" },
    params: [P("hp", "s16", { realistic: [0, 999] }), P("maxhp", "s16", { realistic: [1, 999] }), P("scale", "u8", { realistic: [1, 96] })],
    impls: [
      { label: "battle/interface.ts", file: "src/fr/battle/interface.ts", name: "GetScaledHPFraction" },
      { label: "battle/util.ts", file: "src/fr/battle/util.ts", name: "GetScaledHPFraction" },
    ],
    realisticEvidence: [
      fact("scale is 48 (B_HEALTHBAR_NUM_PIXELS) or a party-menu box dimension", "battle_interface.c:2173", "battle_script_commands.c:7931", "party_menu.c:2439"),
      assumed("hp/maxhp are stat values 0..999 with maxhp >= 1; hp <= maxhp is not enforced (superset); scale 1..96 assumed for the party-menu dimension"),
    ],
    cost: { wrapper: "none (interface.ts exported; util.ts duplicate exported)", state: "none", touchedTs: false, adapters: ["two TS impls compared to one C"], reusable: "multi-impl spec" },
  },
  {
    name: "GetReceivedValueInPixels", group: "B", kind: "pure", ret: "u8",
    c: { stem: "battle_interface", name: "GetReceivedValueInPixels", unstatic: ["GetReceivedValueInPixels"] },
    params: [P("oldValue", "s32", { realistic: [0, 999] }), P("receivedValue", "s32", { realistic: [-999, 999] }),
      P("maxValue", "s32", { realistic: [1, 999] }), P("totalPixels", "u8", { realisticSet: [8] })],
    impls: [{ label: "battle/interface.ts", file: "src/fr/battle/interface.ts", name: "GetReceivedValueInPixels" }],
    realisticEvidence: [
      fact("only caller passes B_EXPBAR_NUM_TILES = 64 / 8 = 8", "battle_interface.c:1864", "battle_interface.c:1846"),
      assumed("oldValue/maxValue are exp-bar values; exp-in-level values can exceed 999, so this range is a lower bound"),
    ],
    cost: { wrapper: "expose non-exported TS fn + unstatic C fn", state: "none", touchedTs: false, adapters: ["esbuild expose", "unstatic in C TU"], reusable: "expose/unstatic" },
  },
  {
    name: "GetAnchorCoord", group: "B", kind: "pure", ret: "s32",
    c: { stem: "sprite", name: "GetAnchorCoord", unstatic: ["GetAnchorCoord"] },
    params: [P("baseDim", "s32", { realisticSet: [2048, 4096, 8192, 16384] }), P("xformed", "s32", { realistic: [-524288, 524288] }),
      P("modifier", "s32", { realistic: [-128, 127] })],
    impls: [{ label: "hw/sprite.ts", file: "src/fr/hw/sprite.ts", name: "getAnchorCoord" }], // TS keeps the older camelCase name
    realisticEvidence: [
      fact("baseDim = dim << 8 with dim in {8,16,32,64}; xformed = (dim << 16) / matrix.a with a an s16", "sprite.c:1223-1225"),
      assumed("modifier is a small anchor coordinate (-128..127)"),
    ],
    cost: { wrapper: "expose non-exported TS fn + unstatic C fn", state: "none", touchedTs: false, adapters: ["esbuild expose", "unstatic in C TU"], reusable: "expose/unstatic" },
  },
  {
    name: "ModifyStatByNature", group: "B", kind: "pure", ret: "u16",
    c: { stem: "pokemon", name: "ModifyStatByNature", unstatic: ["ModifyStatByNature", "sNatureStatTable"] },
    params: [P("nature", "u8", { realistic: [0, 24], structural: true }), P("stat", "u16", { realistic: [0, 595], extra: [595, 596, 727, 728, 729] }), P("statIndex", "u8", { realistic: [0, 5], structural: true })],
    impls: [{ label: "pokemon/pokemon.ts", file: "src/fr/pokemon/pokemon.ts", name: "modifyStatByNature" }], // TS uses camelCase
    realisticEvidence: [
      fact("C comment: the u16 product overflows for stat > 595 (positive nature); base-game stats stay below it", "pokemon.c:5406-5411"),
      fact("BUGFIX is not defined in this build, so the C keeps the u16 intermediate", "pokemon.c:5412"),
    ],
    dataChecks: [{ label: "sNatureStatTable", cSymbol: "sNatureStatTable", stride: 1, type: "s8",
      ts: (ctx) => ctx.ns.mods[ctx.abs("src/fr/pokemon/pokemon.ts")].__o_NATURE_STAT_TABLE.flat() }],
    extraExpose: ["NATURE_STAT_TABLE"],
    cost: { wrapper: "expose non-exported TS fn + table, unstatic fn + table in C", state: "none", touchedTs: false, adapters: ["esbuild expose", "unstatic in C TU", "table data check"], reusable: "expose/unstatic/data-check" },
  },
  {
    name: "GetPlayerDirectionTowardsHiddenItem", group: "B", kind: "pure", ret: "u8",
    c: { stem: "itemfinder", name: "GetPlayerDirectionTowardsHiddenItem", unstatic: ["GetPlayerDirectionTowardsHiddenItem"] },
    params: [P("itemX", "s16", { realistic: [-16, 16] }), P("itemY", "s16", { realistic: [-16, 16] })],
    impls: [{ label: "menus/itemFinder.ts", file: "src/fr/menus/itemFinder.ts", name: "GetPlayerDirectionTowardsHiddenItem" }],
    realisticEvidence: [assumed("offsets are tile distances to a hidden item within the itemfinder search window; +-16 assumed", "itemfinder.c:164")],
    cost: { wrapper: "expose non-exported TS fn + unstatic C fn", state: "none", touchedTs: false, adapters: ["esbuild expose", "unstatic in C TU"], reusable: "expose/unstatic" },
  },
  {
    name: "CalculatePPWithBonus", group: "B", kind: "pure", ret: "u8",
    c: { stem: "pokemon", name: "CalculatePPWithBonus",
      appendC: "unsigned __oracle_move_stride(void){return sizeof(gBattleMoves[0]);}\nunsigned __oracle_move_pp_off(void){return (unsigned)(unsigned long)&((struct BattleMove*)0)->pp;}" },
    params: [P("move", "u16", { realistic: [0, 354], structural: true }), P("ppBonuses", "u8", { realistic: [0, 255] }), P("moveIndex", "u8", { realistic: [0, 3], structural: true })],
    impls: [{ label: "pokemon/mon.ts", file: "src/fr/pokemon/mon.ts", name: "CalculatePPWithBonus" }],
    realisticEvidence: [fact("move ids are 0..MOVES_COUNT-1 (355); moveIndex is a party-mon move slot 0..3", "constants/moves.h:360", "pokemon.c:4206")],
    async setup(ctx) { ctx.rom.moves = json(ctx, "data/moves.json").moves; },
    dataChecks: [{ label: "gBattleMoves.pp", cSymbol: "gBattleMoves", strideFn: "__oracle_move_stride", offsetFn: "__oracle_move_pp_off",
      type: "u8", ts: (ctx) => ctx.rom.moves.slice(0, 355).map((m) => m.pp) }],
    cost: { wrapper: "rom.moves loaded in setup; sizeof/offsetof helper appended to C", state: "rom.moves (data)", touchedTs: false, adapters: ["rom data load", "appendC offsetof helper"], reusable: "data-check helper (table stride/offset)" },
  },
];
