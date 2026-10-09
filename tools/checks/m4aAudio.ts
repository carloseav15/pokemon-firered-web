// Headless C-semantics checks for the M4A WebAudio backend.
// Run: npm run check:m4a
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/fr/generated/constants.ts";
import {
  chorusDetuneCents,
  cryModeParams,
  DUTY_FRACTIONS,
  envelopePlan,
  keysplitSubProgram,
  nr10Sweep,
  pickCrySlot,
  resolveVoice,
  type KeysplitTable,
} from "../../src/fr/audio/m4a.ts";

const root = process.cwd() + "/public/fr/audio/";
const groups = JSON.parse(readFileSync(root + "voicegroups.json", "utf8")).groups as Record<string, any[]>;
const tables = JSON.parse(readFileSync(root + "keysplit_tables.json", "utf8")) as Record<string, KeysplitTable>;

// sound/keysplit_tables.inc: inclusive note mapping from each table's start.
assert.equal(keysplitSubProgram(tables.KeySplitTable1!, 36), 0);
assert.equal(keysplitSubProgram(tables.KeySplitTable1!, 69), 1);
assert.equal(keysplitSubProgram(tables.KeySplitTable1!, 90), 2);
assert.equal(keysplitSubProgram(tables.KeySplitTable1!, 35), null);

// voice_groups.inc voice_keysplit and voice_keysplit_all map to their target groups.
const split = resolveVoice(groups, tables, 12, 1, 69)!;
assert.equal(split.program, 1);
assert.deepEqual(split.voice, groups.voicegroup003![1]);
const splitAll = resolveVoice(groups, tables, 0, 0, 40)!;
assert.equal(splitAll.program, 4); // MIDI note 40 -> target group entry 40 - 36.
assert.deepEqual(splitAll.voice, groups.voicegroup001![4]);
const plain = resolveVoice(groups, tables, 1, 2, 60)!;
assert.equal(plain.program, 2);
assert.equal(plain.voice.kind, "voice_square_1");

// asm/macros/music_voice.inc field masks and m4a.c NR10 pace/direction/shift.
assert.deepEqual(DUTY_FRACTIONS, [0.125, 0.25, 0.5, 0.75]);
assert.equal(nr10Sweep(0), null);
assert.equal(nr10Sweep(0x10), null); // pace 1, shift 0 is no pitch change.
assert.equal(nr10Sweep(0x19)!.semitones, -12); // negate, shift 1 => frequency / 2.
assert.ok(Math.abs(nr10Sweep(0x11)!.semitones - 12 * Math.log2(1.5)) < 1e-9);
assert.equal(nr10Sweep(0x11)!.time, 1 / 128); // hardware sweep sequencer pace.

// CGB envelope counters advance one volume unit at each configured period.
const instant = envelopePlan("voice_square_1", 0, 0, 15, 0, 0.5);
assert.equal(instant.attackTime, 0.005);
assert.equal(instant.sustainLevel, 0.5);
assert.equal(instant.releaseTime, 0.03); // WebAudio de-click approximation for C pseudo-echo.
const shaped = envelopePlan("voice_square_1", 7, 7, 8, 7, 1);
assert.equal(shaped.attackTime, (7 * 15) / 64);
assert.equal(shaped.decayTime, (7 * 7) / 64);
assert.ok(Math.abs(shaped.sustainLevel - 8 / 15) < 1e-9);
assert.equal(shaped.releaseTime, (7 * 15) / 64);
const direct = envelopePlan("voice_directsound", 0xff, 0, 0xff, 0xff, 1);
assert.equal(direct.attackTime, 0.005);
assert.equal(direct.sustainLevel, 1);
// pokeemerald's voice_directsound_reverse (TONEDATA_TYPE_REV) uses the direct-sound envelope, not the CGB one.
assert.deepEqual(envelopePlan("voice_directsound_reverse", 0xff, 0, 0xff, 0xff, 1), direct);

// sound.c PlayCryInternal per-mode values and m4a.c SetPokemonCryChorus's s8 key delta.
assert.deepEqual(cryModeParams(C.CRY_MODE_NORMAL), {
  length: 140, release: 0, pitch: 15360, chorus: 0, volume: 120, reverse: false,
});
assert.deepEqual(cryModeParams(C.CRY_MODE_ENCOUNTER), {
  length: 140, release: 225, pitch: 15600, chorus: 20, volume: 90, reverse: false,
});
assert.deepEqual(cryModeParams(C.CRY_MODE_ECHO_START), {
  length: 25, release: 100, pitch: 15600, chorus: 192, volume: 90, reverse: true,
});
assert.equal(chorusDetuneCents(20), 2000);
assert.equal(chorusDetuneCents(192), -6400); // s8 0xC0 -> -64 semitones.

// m4a.c SetPokemonCryTone: use a free player, else steal the longest clock.
assert.equal(pickCrySlot([null, null]), 0);
assert.equal(pickCrySlot([{ clock: 5 }, null]), 1);
assert.equal(pickCrySlot([{ clock: 5 }, { clock: 9 }]), 1);
assert.equal(pickCrySlot([{ clock: 9 }, { clock: 5 }]), 0);

console.log("PASS: M4A keysplit, NR10, ADSR, cry modes/chorus and 2-player arbitration.");
