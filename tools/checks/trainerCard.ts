// Headless check for Trainer Card screen parity (trainer_card.c)
// Run with: npm run check:card

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData, registerIncbinIndex, registerPack, symName, type SymRef } from '../../src/fr/hw/assets.ts';
import { rom } from '../../src/fr/rom.ts';
import * as C from '../../src/fr/generated/constants.ts';
import { save } from '../../src/fr/save.ts';
import { gMain, runHwFrame } from '../../src/fr/hw/runtime.ts';
import { ppu, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, WIN_RANGE } from '../../src/fr/hw/ppu.ts';
import { gWindows } from '../../src/fr/hw/window.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { joy, A_BUTTON, B_BUTTON } from '../../src/fr/gba/input.ts';
import {
  GetTrainerCardMainState, GetTrainerCardStars, MailSpeciesToIconSpecies, ShowPlayerTrainerCard,
} from '../../src/fr/menus/trainerCard.ts';

const root = process.cwd() + '/public/fr/';

// 1. Load constants, strings, species, charmap, incbin index
rom.constants = JSON.parse(readFileSync(root + 'constants.json', 'utf8'));
rom.charmap = JSON.parse(readFileSync(root + 'charmap.json', 'utf8'));
rom.strings = JSON.parse(readFileSync(root + 'data/strings.json', 'utf8'));
const speciesRaw = JSON.parse(readFileSync(root + 'data/species.json', 'utf8'));
rom.species = speciesRaw.species;
rom.pokedex = speciesRaw.pokedex;
rom.fonts = JSON.parse(readFileSync(root + 'gfx/fonts.json', 'utf8'));

registerIncbinIndex(JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8')));
registerPack('graphics_trainer_card', new Uint8Array(readFileSync(root + 'incbin/graphics_trainer_card.bin')));
registerPack('graphics_trainers', new Uint8Array(readFileSync(root + 'incbin/graphics_trainers.bin')));
registerPack('pokemon', new Uint8Array(readFileSync(root + 'incbin/pokemon.bin')));
registerPack('graphics_interface', new Uint8Array(readFileSync(root + 'incbin/graphics_interface.bin')));
registerPack('graphics_text_window', new Uint8Array(readFileSync(root + 'incbin/graphics_text_window.bin')));

// 2. Register cdata
const trainerCardCData = JSON.parse(readFileSync(root + 'cdata/trainer_card.json', 'utf8'));
registerCData('trainer_card', trainerCardCData.defs);
const pokemonIconCData = JSON.parse(readFileSync(root + 'cdata/pokemon_icon.json', 'utf8'));
registerCData('pokemon_icon', pokemonIconCData.defs);
const textWindowGfxCData = JSON.parse(readFileSync(root + 'cdata/text_window_graphics.json', 'utf8'));
registerCData('text_window_graphics', textWindowGfxCData.defs);

console.log('--- Checking trainer_card.c cdata definitions ---');

const defs = trainerCardCData.defs;
assert.ok(defs.sTrainerCardBgTemplates, 'sTrainerCardBgTemplates must exist');
const bgTemplates = defs.sTrainerCardBgTemplates.value;
assert.equal(bgTemplates.length, 4, 'Must have 4 background templates');
assert.equal(bgTemplates[0].bg, 0, 'BG0 priority 2, map base 27');
assert.equal(bgTemplates[0].mapBaseIndex, 27);
assert.equal(bgTemplates[1].bg, 1, 'BG1 priority 0, map base 29');
assert.equal(bgTemplates[1].mapBaseIndex, 29);
assert.equal(bgTemplates[2].bg, 2, 'BG2 priority 3, map base 30');
assert.equal(bgTemplates[2].mapBaseIndex, 30);
assert.equal(bgTemplates[3].bg, 3, 'BG3 priority 1, map base 31, baseTile 192');
assert.equal(bgTemplates[3].baseTile, 192);

assert.ok(defs.sTrainerCardWindowTemplates, 'sTrainerCardWindowTemplates must exist');
const winTemplates = defs.sTrainerCardWindowTemplates.value;
assert.equal(winTemplates.length, 4, 'Must have 4 window templates');
assert.equal(winTemplates[1].bg, 1, 'Window 1 is on BG1 (main card text)');
assert.equal(winTemplates[1].tilemapLeft, 1);
assert.equal(winTemplates[1].tilemapTop, 1);
assert.equal(winTemplates[1].width, 27);
assert.equal(winTemplates[1].height, 18);
assert.equal(winTemplates[2].bg, 3, 'Window 2 is on BG3 (trainer front pic)');
assert.equal(winTemplates[2].tilemapLeft, 19);
assert.equal(winTemplates[2].tilemapTop, 5);
assert.equal(winTemplates[2].width, 9);
assert.equal(winTemplates[2].height, 10);

assert.ok(defs.sKantoTrainerCardPals, 'sKantoTrainerCardPals must exist');
const kantoPals = defs.sKantoTrainerCardPals.value;
assert.equal(kantoPals.length, 5, 'Must have 5 star palettes (Blue, Green, Bronze, Silver, Gold)');
assert.equal(symName(kantoPals[0]), 'gKantoTrainerCardBlue_Pal');
assert.equal(symName(kantoPals[1]), 'sKantoTrainerCardGreen_Pal');
assert.equal(symName(kantoPals[2]), 'sKantoTrainerCardBronze_Pal');
assert.equal(symName(kantoPals[3]), 'sKantoTrainerCardSilver_Pal');
assert.equal(symName(kantoPals[4]), 'sKantoTrainerCardGold_Pal');

console.log('✓ cdata tables verified successfully');

console.log('--- Testing MailSpeciesToIconSpecies helper ---');
assert.equal(MailSpeciesToIconSpecies(C.SPECIES_CHARIZARD), C.SPECIES_CHARIZARD);
assert.equal(MailSpeciesToIconSpecies(C.SPECIES_PIKACHU), C.SPECIES_PIKACHU);
assert.equal(MailSpeciesToIconSpecies(30000), C.SPECIES_UNOWN);
assert.equal(MailSpeciesToIconSpecies(30001), C.SPECIES_UNOWN_B);

console.log('--- Testing Star Count logic ---');
// Fresh save: 0 stars
save.gameStats[rom.constants.GAME_STAT_ENTERED_HOF] = 0;
save.gameStats[rom.constants.GAME_STAT_FIRST_HOF_PLAY_TIME] = 0;
save.pokedexCaught = new Array(64).fill(0);
assert.equal(GetTrainerCardStars(), 0, 'Fresh cart has 0 stars (Blue card)');

// Enter HoF: 1 star
save.gameStats[rom.constants.GAME_STAT_ENTERED_HOF] = 1;
save.gameStats[rom.constants.GAME_STAT_FIRST_HOF_PLAY_TIME] = (12 << 16) | (34 << 8) | 56;
assert.equal(GetTrainerCardStars(), 1, 'HoF debut awards 1 star (Green card)');

console.log('✓ Star count calculation verified');

console.log('--- Testing ShowPlayerTrainerCard and HW scene lifecycle ---');
save.playerName = [0xbb, 0xbf, 0xb8, 0xff]; // RED
save.playerGender = C.MALE;
save.trainerId = 12345;
save.money = 54321;
save.playTimeFrames = 60 * 3600 * 5 + 60 * 60 * 42; // 5 hours, 42 minutes

// Give first 3 badges
save.flags[rom.constants.FLAG_BADGE01_GET >> 3] |= (1 << (rom.constants.FLAG_BADGE01_GET & 7));
save.flags[rom.constants.FLAG_BADGE02_GET >> 3] |= (1 << (rom.constants.FLAG_BADGE02_GET & 7));
save.flags[rom.constants.FLAG_BADGE03_GET >> 3] |= (1 << (rom.constants.FLAG_BADGE03_GET & 7));

let closed = false;
ShowPlayerTrainerCard(() => {
  closed = true;
});

// Run init frames and wait until card finishes drawing and fade in completes
for (let frame = 0; frame < 80; frame++) {
  runHwFrame();
  const state = GetTrainerCardMainState();
  if (state === 10) break;
}
assert.equal(GetTrainerCardMainState(), 10, 'Card must reach front input state');

// Check GPU registers
assert.equal(ppu.io[REG_OFFSET_WIN0H >> 1], WIN_RANGE(0, 240), 'WIN0H should span 0..240');
assert.equal(ppu.io[REG_OFFSET_WIN0V >> 1], WIN_RANGE(0, 160), 'WIN0V should span 0..160');

// Window 1 should have valid tileData
assert.ok(gWindows[1].tileData, 'Window 1 tile data must be allocated');
assert.ok(gWindows[2].tileData, 'Window 2 tile data must be allocated for trainer pic');

console.log('✓ Card initialized on front side with windows and GPU registers');

console.log('--- Testing Card Flip Animation ---');
// Press A to flip to back
joy.newKeys = A_BUTTON;
runHwFrame();
joy.newKeys = 0;

// Card flip down takes ~11 frames (7px per frame from 0 to 77)
let flippedDown = false;
for (let frame = 0; frame < 15; frame++) {
  runHwFrame();
  const win0v = ppu.io[REG_OFFSET_WIN0V >> 1];
  const top = (win0v >> 8) & 0xff;
  if (top >= 77) {
    flippedDown = true;
    break;
  }
}
assert.ok(flippedDown, 'Card must compress vertically to top >= 77 during flip');

// Expand back up and wait until card reaches back input state
for (let frame = 0; frame < 40; frame++) {
  runHwFrame();
  if (GetTrainerCardMainState() === 11) break; // STATE_HANDLE_INPUT_BACK
}
assert.equal(GetTrainerCardMainState(), 11, 'Card must reach back input state');
assert.equal(ppu.io[REG_OFFSET_WIN0V >> 1], WIN_RANGE(0, 160), 'Card must expand back to full height (0..160)');
console.log('✓ 3D Card flip perspective animation completed to back side');

// Press B to flip back to front
joy.newKeys = B_BUTTON;
runHwFrame();
joy.newKeys = 0;

// Advance through flip back to front
for (let frame = 0; frame < 50; frame++) {
  runHwFrame();
  if (GetTrainerCardMainState() === 10) break; // STATE_HANDLE_INPUT_FRONT
}
assert.equal(GetTrainerCardMainState(), 10, 'Card must return to front input state');
console.log('✓ Flipped back to front side');

// Press B to close card
joy.newKeys = B_BUTTON;
runHwFrame();
joy.newKeys = 0;

// Fade out and wait for close callback
for (let frame = 0; frame < 40; frame++) {
  runHwFrame();
  if (closed) break;
}

assert.ok(closed, 'Close callback must be called after fade out');
console.log('✓ Card closed successfully with fade out');

console.log('All Trainer Card tests passed successfully!');
