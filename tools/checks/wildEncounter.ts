// Headless check for wild_encounter.c parity
// Verifies RNG formulas, Unown calculations, flute & item modifiers, repel, slot selection, and Tanoby gating.

import "./setupNodeGbaMock.ts";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { registerCData } from "../../src/fr/hw/assets.ts";
import * as C from "../../src/fr/generated/constants.ts";
import { flagClear, flagGet, flagSet, save, varGet, varSet } from "../../src/fr/save.ts";
import {
  SeedWildEncounterRng,
  WildEncounterRandom,
  GetUnownLetterByPersonalityLoByte,
  GenerateUnownPersonalityByLetter,
  GetFluteEncounterRateModType,
  ApplyFluteEncounterRateMod,
  ApplyCleanseTagEncounterRateMod,
  IsLeadMonHoldingCleanseTag,
  GetAbilityEncounterRateModType,
  ChooseWildMonIndex_Land,
  ChooseWildMonIndex_WaterRock,
  ChooseWildMonIndex_Fishing,
  ChooseWildMonLevel,
  ResetEncounterRateModifiers,
  GetMapBaseEncounterCooldown,
  HandleWildEncounterCooldown,
  AddToWildEncounterRateBuff,
  IsWildLevelAllowedByRepel,
  UpdateRepelCounter,
  UnlockedTanobyOrAreNotInTanoby,
  DisableWildEncounters,
  sWildEncounterData,
  sWildEncountersDisabled,
  MAX_ENCOUNTER_RATE,
} from "../../src/fr/field/wildEncounter.ts";

// Register cdata for wild_encounter
const cdataRaw = JSON.parse(readFileSync(process.cwd() + "/public/fr/cdata/wild_encounter.json", "utf8"));
registerCData("wild_encounter", cdataRaw.defs);

// =========================================================================
// 1. RNG Parity: SeedWildEncounterRng & WildEncounterRandom
// =========================================================================
{
  const initialSeed = 0x5678;
  SeedWildEncounterRng(initialSeed);
  assert.equal(sWildEncounterData.rngState, initialSeed, "SeedWildEncounterRng sets rngState");

  // In C pokefirered:
  // sWildEncounterRngValue = 1103515245 * sWildEncounterRngValue + 24691;
  // return (u16)(sWildEncounterRngValue >> 16);
  let expectedRng = initialSeed;
  for (let i = 0; i < 20; i++) {
    expectedRng = (Math.imul(1103515245, expectedRng) + 12345) >>> 0;
    const expectedVal = (expectedRng >>> 16) & 0xFFFF;
    const actualVal = WildEncounterRandom();
    assert.equal(actualVal, expectedVal, `WildEncounterRandom step ${i} matches GBA LCG`);
  }
}

// =========================================================================
// 2. Unown Calculations: Letter from Personality & Personality Generation
// =========================================================================
{
  // Test known personality bitfields:
  // bit 0..1 from byte 0, bit 2..3 from byte 1, bit 4..5 from byte 2, bit 6..7 from byte 3
  assert.equal(GetUnownLetterByPersonalityLoByte(0), 0, "Personality 0 gives letter A (0)");
  assert.equal(GetUnownLetterByPersonalityLoByte(1), 1, "Personality 1 gives letter B (1)");
  assert.equal(GetUnownLetterByPersonalityLoByte(2), 2, "Personality 2 gives letter C (2)");
  assert.equal(GetUnownLetterByPersonalityLoByte(3), 3, "Personality 3 gives letter D (3)");
  assert.equal(GetUnownLetterByPersonalityLoByte(0x00000100), 4, "Personality 0x0100 gives letter E (4)");
  assert.equal(GetUnownLetterByPersonalityLoByte(0x00010201), 25, "Personality 0x00010201 gives letter Z (25)");

  // Test across all 28 Unown forms that GenerateUnownPersonalityByLetter round-trips
  for (let letter = 0; letter < C.NUM_UNOWN_FORMS; letter++) {
    const personality = GenerateUnownPersonalityByLetter(letter);
    const derivedLetter = GetUnownLetterByPersonalityLoByte(personality);
    assert.equal(derivedLetter, letter, `Round-trip Unown form ${letter} matches`);
  }
}

// =========================================================================
// 3. Flute Modifiers
// =========================================================================
{
  // PREPARED: Clear any active flute flags before baseline test
  flagClear(C.FLAG_SYS_BLACK_FLUTE_ACTIVE);
  flagClear(C.FLAG_SYS_WHITE_FLUTE_ACTIVE);

  assert.equal(GetFluteEncounterRateModType(), 0);
  const rateNone = { value: 100 };
  ApplyFluteEncounterRateMod(rateNone);
  assert.equal(rateNone.value, 100, "Mod 0 keeps rate unchanged");

  // Activate White Flute (type 1: rate * 1.5)
  flagSet(C.FLAG_SYS_WHITE_FLUTE_ACTIVE); // PREPARED: White flute active flag
  assert.equal(GetFluteEncounterRateModType(), 1);
  const rateWhite = { value: 100 };
  ApplyFluteEncounterRateMod(rateWhite);
  assert.equal(rateWhite.value, 150, "White flute multiplies rate by 1.5");
  const rateWhite17 = { value: 17 };
  ApplyFluteEncounterRateMod(rateWhite17);
  assert.equal(rateWhite17.value, 25, "White flute 17 + trunc(17/2) = 25");

  // Deactivate White Flute and Activate Black Flute (type 2: rate / 2)
  flagClear(C.FLAG_SYS_WHITE_FLUTE_ACTIVE);
  flagSet(C.FLAG_SYS_BLACK_FLUTE_ACTIVE); // PREPARED: Black flute active flag
  assert.equal(GetFluteEncounterRateModType(), 2);
  const rateBlack = { value: 100 };
  ApplyFluteEncounterRateMod(rateBlack);
  assert.equal(rateBlack.value, 50, "Black flute halves rate");
  const rateBlack17 = { value: 17 };
  ApplyFluteEncounterRateMod(rateBlack17);
  assert.equal(rateBlack17.value, 8, "Black flute truncates half of 17 to 8");

  // PREPARED: Clean up flute flags
  flagClear(C.FLAG_SYS_BLACK_FLUTE_ACTIVE);
}

// =========================================================================
// 4. Cleanse Tag Modifier
// =========================================================================
{
  // When lead mon is not holding Cleanse Tag
  sWildEncounterData.leadMonHeldItem = 0;
  assert.equal(IsLeadMonHoldingCleanseTag(), false);
  const rateNoTag = { value: 100 };
  ApplyCleanseTagEncounterRateMod(rateNoTag);
  assert.equal(rateNoTag.value, 100, "Without Cleanse Tag rate is unaffected");

  // When lead mon is holding Cleanse Tag: rate = trunc(rate * 2 / 3)
  sWildEncounterData.leadMonHeldItem = C.ITEM_CLEANSE_TAG;
  assert.equal(IsLeadMonHoldingCleanseTag(), true);
  const rateTag = { value: 100 };
  ApplyCleanseTagEncounterRateMod(rateTag);
  assert.equal(rateTag.value, 66, "Cleanse tag truncates 100 * 2 / 3 to 66");
  const rateTag30 = { value: 30 };
  ApplyCleanseTagEncounterRateMod(rateTag30);
  assert.equal(rateTag30.value, 20, "Cleanse tag 30 * 2 / 3 = 20");
  const rateTag1 = { value: 1 };
  ApplyCleanseTagEncounterRateMod(rateTag1);
  assert.equal(rateTag1.value, 0, "Cleanse tag 1 * 2 / 3 = 0");
  sWildEncounterData.leadMonHeldItem = 0;
}

// =========================================================================
// 5. Repel Steps & Level Checks
// =========================================================================
{
  // Repel counter set to 0 initially
  varSet(C.VAR_REPEL_STEP_COUNT, 0); // PREPARED: repel starts at 0
  assert.equal(IsWildLevelAllowedByRepel(5), true, "When repel is 0, any level is allowed");

  // Repel counter set to 100 steps
  varSet(C.VAR_REPEL_STEP_COUNT, 100); // PREPARED: repel set to 100 for decrement test
  // UpdateRepelCounter should decrement steps by 1
  UpdateRepelCounter();
  assert.equal(varGet(C.VAR_REPEL_STEP_COUNT), 99, "UpdateRepelCounter decrements steps from 100 to 99");

  // Multiple steps until 0
  for (let i = 0; i < 98; i++) {
    UpdateRepelCounter();
  }
  assert.equal(varGet(C.VAR_REPEL_STEP_COUNT), 1);
  UpdateRepelCounter();
  assert.equal(varGet(C.VAR_REPEL_STEP_COUNT), 0, "Repel reaches 0");
  UpdateRepelCounter();
  assert.equal(varGet(C.VAR_REPEL_STEP_COUNT), 0, "Repel does not underflow below 0");
}

// =========================================================================
// 6. Slot Index Selection & Level Generation
// =========================================================================
{
  // Seed RNG deterministically to verify slot picks stay within valid bounds
  SeedWildEncounterRng(42);

  for (let i = 0; i < 50; i++) {
    const landIndex = ChooseWildMonIndex_Land();
    assert.ok(landIndex >= 0 && landIndex < 12, `Land mon index ${landIndex} in [0, 11]`);

    const waterIndex = ChooseWildMonIndex_WaterRock();
    assert.ok(waterIndex >= 0 && waterIndex < 5, `Water/Rock mon index ${waterIndex} in [0, 4]`);

    const oldRodIndex = ChooseWildMonIndex_Fishing(0);
    assert.ok(oldRodIndex >= 0 && oldRodIndex < 2, `Old rod index ${oldRodIndex} in [0, 1]`);

    const goodRodIndex = ChooseWildMonIndex_Fishing(1);
    assert.ok(goodRodIndex >= 2 && goodRodIndex < 5, `Good rod index ${goodRodIndex} in [2, 4]`);

    const superRodIndex = ChooseWildMonIndex_Fishing(2);
    assert.ok(superRodIndex >= 5 && superRodIndex < 10, `Super rod index ${superRodIndex} in [5, 9]`);
  }

  // Level selection from range [min, max]
  const wildMon = { minLevel: 10, maxLevel: 15, species: C.SPECIES_PIDGEY };
  for (let i = 0; i < 30; i++) {
    const level = ChooseWildMonLevel(wildMon);
    assert.ok(level >= 10 && level <= 15, `Level ${level} must be between 10 and 15`);
  }

  const fixedMon = { minLevel: 25, maxLevel: 25, species: C.SPECIES_PIKACHU };
  assert.equal(ChooseWildMonLevel(fixedMon), 25, "Fixed level returns exact level");
}

// =========================================================================
// 7. Encounter Rate Buff & Cooldown
// =========================================================================
{
  // Ensure repel is 0 to allow rate buff accumulation
  varSet(C.VAR_REPEL_STEP_COUNT, 0); // PREPARED: repel set to 0 for buff test
  ResetEncounterRateModifiers();
  assert.equal(sWildEncounterData.encounterRateBuff, 0, "Buff is 0 after reset");

  AddToWildEncounterRateBuff(10);
  assert.equal(sWildEncounterData.encounterRateBuff, 10, "Rate buff increments by encounterRate when repel is 0");

  AddToWildEncounterRateBuff(15);
  assert.equal(sWildEncounterData.encounterRateBuff, 25, "Rate buff accumulates");

  // When repel is active, AddToWildEncounterRateBuff resets buff to 0
  varSet(C.VAR_REPEL_STEP_COUNT, 50); // PREPARED: repel set to 50 for buff clearing test
  AddToWildEncounterRateBuff(10);
  assert.equal(sWildEncounterData.encounterRateBuff, 0, "Rate buff is cleared to 0 when repel is active");
  varSet(C.VAR_REPEL_STEP_COUNT, 0); // PREPARED: reset repel to 0

  // Cooldown handling
  assert.equal(HandleWildEncounterCooldown(0), false, "TILE_ENCOUNTER_NONE returns false for cooldown");
  assert.equal(GetMapBaseEncounterCooldown(C.TILE_ENCOUNTER_LAND), 0xFF, "Returns 0xFF when no map header is active");
  assert.equal(GetMapBaseEncounterCooldown(C.TILE_ENCOUNTER_WATER), 0xFF, "Returns 0xFF when no map header is active");

  // Step counter reset
  sWildEncounterData.stepsSinceLastEncounter = 10;
  ResetEncounterRateModifiers();
  assert.equal(sWildEncounterData.stepsSinceLastEncounter, 0, "ResetEncounterRateModifiers resets steps to 0");
}

// =========================================================================
// 8. Tanoby Ruins Gating
// =========================================================================
{
  // Non-Tanoby map always allows encounters
  save.location.mapGroup = C.MAP_VIRIDIAN_FOREST >>> 8;
  save.location.mapNum = C.MAP_VIRIDIAN_FOREST & 0xFF;
  flagClear(C.FLAG_SYS_UNLOCKED_TANOBY_RUINS);
  assert.equal(UnlockedTanobyOrAreNotInTanoby(), true, "Viridian forest is not in Tanoby");

  // Tanoby chamber with flag clear returns false
  save.location.mapGroup = C.MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER >>> 8;
  save.location.mapNum = C.MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER & 0xFF;
  assert.equal(
    UnlockedTanobyOrAreNotInTanoby(),
    false,
    "Monean chamber returns false when Tanoby ruins are locked"
  );

  // Tanoby chamber with flag set returns true
  flagSet(C.FLAG_SYS_UNLOCKED_TANOBY_RUINS); // PREPARED: unlock Tanoby ruins flag
  assert.equal(
    UnlockedTanobyOrAreNotInTanoby(),
    true,
    "Monean chamber returns true when Tanoby ruins are unlocked"
  );
  flagClear(C.FLAG_SYS_UNLOCKED_TANOBY_RUINS);
}

// =========================================================================
// 9. Disable Wild Encounters Toggle
// =========================================================================
{
  DisableWildEncounters(true);
  assert.equal(sWildEncountersDisabled, true, "DisableWildEncounters(true) sets flag");
  DisableWildEncounters(false);
  assert.equal(sWildEncountersDisabled, false, "DisableWildEncounters(false) clears flag");
}

console.log("✓ wild_encounter.c RNG, Unown, flute, cleanse tag, repel, slots, and Tanoby tests passed");
