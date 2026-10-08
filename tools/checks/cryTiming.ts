// Cry selection and cry timing in frames (sound.c PlayCryInternal / IsCryPlaying / IsCryFinished, m4a.c).
// Run: npm run check:cry-timing
// - PlayCryInternal does species-- and SpeciesToCryId: the backend must receive the gCryTable index whose exported
//   WAV is the species' own cry (cry_tables.inc starts with Bulbasaur at index 0).
// - IsCryPlaying is TRUE for the frames the cry channel lives (sample end or release envelope end), counted by
//   sound.frame(), with no dependence on the browser audio clock. Expected frame counts are worked out by hand below.
// - IsCryFinished only waits for the BGM ducking task (PlayCry_Normal and PlayCry_ByMode create it, except doubles).
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/fr/generated/constants.ts";
import { sound, cryChannelFrames } from "../../src/fr/audio/sound.ts";
import { tasks } from "../../src/fr/gba/tasks.ts";

// Data loads read public/fr through a fetch stub (DATA_ROOT "/fr").
(globalThis as any).fetch = async (url: string) => {
  const file = process.cwd() + "/public" + String(url);
  return { ok: true, json: async () => JSON.parse(readFileSync(file, "utf8")), arrayBuffer: async () => readFileSync(file).buffer };
};
await sound.loadCryData();
const order = JSON.parse(readFileSync(process.cwd() + "/public/fr/audio/cries.json", "utf8")).order as Array<string | null>;

// Backend stub: records the cry id it is asked to play; every other method is a no-op.
const played: number[] = [];
sound.backend = new Proxy({ playCry: (cryId: number) => { played.push(cryId); } } as any, {
  get: (t, k) => (k in t ? t[k] : () => false),
});
sound.init(JSON.parse(readFileSync(process.cwd() + "/public/fr/constants.json", "utf8")));

const cryFile = (species: number, mode = C.CRY_MODE_NORMAL) => { sound.stopCry(); sound.PlayCry_ByMode(species, 0, mode); return order[played.at(-1)!]; };
assert.equal(cryFile(C.SPECIES_BULBASAUR), "bulbasaur.wav");
assert.equal(cryFile(C.SPECIES_IVYSAUR), "ivysaur.wav");
assert.equal(cryFile(C.SPECIES_MEW), "mew.wav");
assert.equal(cryFile(C.SPECIES_CHIKORITA), "chikorita.wav");
assert.equal(cryFile(C.SPECIES_CELEBI), "celebi.wav");
assert.equal(cryFile(C.SPECIES_TREECKO), "treecko.wav");
assert.equal(cryFile(C.SPECIES_OLD_UNOWN_B), "unown.wav");

// Envelope bound: release 125 from 255 -> 124, 60, 29, 14, 6, 2, 0 = 7 frames; release 225 -> 43 frames;
// release 0 stops on the next frame.
assert.equal(cryChannelFrames(15, 125, 15200, null), 15 + 7);
assert.equal(cryChannelFrames(140, 0, 15360, null), 141);
// Sample bound: bulbasaur.wav 8184 samples at 10512 Hz, pitch 15360 -> 0.77854 s x 59.7275 = 46.50 -> 47 frames.
const bulbasaur = order.indexOf("bulbasaur.wav");
const samples = JSON.parse(readFileSync(process.cwd() + "/public/fr/audio/cries.json", "utf8")).samples[bulbasaur];
assert.deepEqual(samples, [10512, 8184]);
assert.equal(cryChannelFrames(140, 0, 15360, samples), 47);  // CRY_MODE_NORMAL: the sample ends first
assert.equal(cryChannelFrames(15, 125, 15200, samples), 22); // CRY_MODE_GROWL_1: the envelope ends first

// IsCryPlaying follows those frames through sound.frame().
const framesPlaying = (species: number, mode: number) => {
  sound.stopCry(); sound.PlayCry_ByMode(species, 0, mode);
  let n = 0; while (sound.isCryPlaying() && n < 1000) { sound.frame(); n++; }
  return n;
};
assert.equal(framesPlaying(C.SPECIES_BULBASAUR, C.CRY_MODE_NORMAL), 47);
assert.equal(framesPlaying(C.SPECIES_BULBASAUR, C.CRY_MODE_GROWL_1), 22);

// IsCryFinished only looks at the BGM ducking task (sound.c). PlayCry_ByMode ducks the BGM except in
// CRY_MODE_DOUBLES: a doubles cry is "finished" at once while its channel still plays; a normal one is not.
tasks.reset(); // the earlier normal cries left their ducking task (no task runner here)
sound.stopCry(); sound.PlayCry_ByMode(C.SPECIES_BULBASAUR, 0, C.CRY_MODE_DOUBLES);
assert.equal(sound.isCryPlaying(), true);
assert.equal(sound.isCryFinished(), true);
sound.PlayCry_ByMode(C.SPECIES_BULBASAUR, 0, C.CRY_MODE_NORMAL);
assert.equal(sound.isCryFinished(), false);
console.log("cry timing PASS (cry ids, envelope/sample frames, IsCryPlaying, IsCryFinished)");
