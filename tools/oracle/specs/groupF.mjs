// Group F: pokemon.c lookup/number functions (scalar arguments, table data from cdata or rom.species).
// Added after the pokemon.c review (TAREAS-FINALES §2): the TS readers of sSpeciesToNationalPokedexNum,
// sSpeciesToHoennPokedexNum, sHoennToNationalOrder, sHoennSpeciesIdToCryId, sHMMoves and the flavor table are
// compared with the C over the whole species / move / personality domain.
import { readFileSync } from "node:fs";
import path from "node:path";

const P = (n, t, extra = {}) => ({ n, t, ...extra });
const fact = (text, ...refs) => ({ level: "fact", text, refs });
const NO = { wrapper: "none", state: "none", touchedTs: false };
const json = (ctx, rel) => JSON.parse(readFileSync(path.join(ctx.ROOT, "public/fr", rel), "utf8"));
const pokemonCData = async (ctx) => { ctx.assets.registerCData("pokemon", json(ctx, "cdata/pokemon.json").defs); };
const speciesData = async (ctx) => { ctx.rom.species = json(ctx, "data/species.json").species; };
const SPECIES = [0, 411];
const speciesEvidence = fact("species ids are 0..NUM_SPECIES-1 (412 entries); the lookup tables have NUM_SPECIES-1 = 411 entries", "constants/species.h:423");
const cost = (adapters) => ({ ...NO, adapters, reusable: "cdata registration (setup)" });

const direct = (name, file, ret, params, opts = {}) => ({
  name, group: "F", kind: "pure", ret,
  c: { stem: "pokemon", name, ...(opts.unstatic ? { unstatic: [name] } : {}) },
  params,
  impls: [{ label: file.replace("src/games/firered/", ""), file, name }],
  realisticEvidence: opts.evidence ?? [speciesEvidence],
  setup: opts.setup,
  cost: cost(opts.adapters ?? []),
});

export default [
  direct("GetNatureFromPersonality", "src/games/firered/pokemon/mon.ts", "u8",
    [P("personality", "u32", { realistic: [0, 4294967295] })], { unstatic: true, evidence: [fact("personality is an arbitrary u32; nature = personality % NUM_NATURES (25)", "pokemon.c:5020")] }),
  direct("GetFlavorRelationByPersonality", "src/games/firered/pokemon/mon_extra.ts", "s8",
    [P("personality", "u32", { realistic: [0, 4294967295] }), P("flavor", "u8", { realistic: [0, 4], structural: true })],
    { setup: pokemonCData, adapters: ["cdata pokemon"], evidence: [fact("flavor is FLAVOR_SPICY..FLAVOR_SOUR (0..4); the table is 25 natures x 5", "pokemon.c:5959", "constants/pokemon.h")] }),
  direct("SpeciesToNationalPokedexNum", "src/games/firered/pokemon/mon.ts", "u16", [P("species", "u16", { realistic: SPECIES, structural: true })],
    { setup: speciesData, adapters: ["rom.species"] }),
  direct("NationalPokedexNumToSpecies", "src/games/firered/pokemon/mon.ts", "u16", [P("nationalNum", "u16", { realistic: [0, 411], structural: true })],
    { setup: speciesData, adapters: ["rom.species"], evidence: [fact("national numbers are 1..386 plus the unused slots of the 411-entry table", "pokemon.c:5174")] }),
  direct("SpeciesToHoennPokedexNum", "src/games/firered/pokemon/pokemon.ts", "u16", [P("species", "u16", { realistic: SPECIES, structural: true })],
    { unstatic: true, setup: pokemonCData, adapters: ["cdata pokemon"] }),
  direct("HoennPokedexNumToSpecies", "src/games/firered/pokemon/pokemon.ts", "u16", [P("hoennNum", "u16", { realistic: [0, 411], structural: true })],
    { unstatic: true, setup: pokemonCData, adapters: ["cdata pokemon"] }),
  direct("NationalToHoennOrder", "src/games/firered/pokemon/pokemon.ts", "u16", [P("nationalNum", "u16", { realistic: [0, 411], structural: true })],
    { unstatic: true, setup: pokemonCData, adapters: ["cdata pokemon"] }),
  direct("HoennToNationalOrder", "src/games/firered/pokemon/pokemon.ts", "u16", [P("hoennNum", "u16", { realistic: [0, 411], structural: true })],
    { setup: pokemonCData, adapters: ["cdata pokemon"] }),
  direct("SpeciesToCryId", "src/games/firered/pokemon/pokemon.ts", "u16", [P("species", "u16", { realistic: SPECIES, structural: true })],
    { setup: pokemonCData, adapters: ["cdata pokemon"] }),
  direct("IsHMMove2", "src/games/firered/pokemon/mon_extra.ts", "bool8", [P("move", "u16", { realistic: [0, 354], structural: true })],
    { setup: pokemonCData, adapters: ["cdata pokemon"], evidence: [fact("move ids are 0..MOVES_COUNT-1 (355); sHMMoves ends with HM_MOVES_END", "pokemon.c:5937")] }),
  direct("IsMonSpriteNotFlipped", "src/games/firered/pokemon/pics.ts", "bool8", [P("species", "u16", { realistic: SPECIES, structural: true })],
    { setup: speciesData, adapters: ["rom.species"] }),
];
