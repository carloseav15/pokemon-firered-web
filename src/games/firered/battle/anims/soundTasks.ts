// battle_anim_sound_tasks.c: sound tasks of the battle animation scripts
// (looped/panned SEs and the special cries of Growl, Roar, Hyper Voice…).
// Cry WAVs and DSP remain approximate, but mode, pan, volume ducking and task wait follow sound.c.

import * as C from "../../generated/constants";
import { sound } from "../../audio/sound";
import { GetMonData, gEnemyParty, playerMon } from "../../pokemon/mon";
import { animState, DestroyAnimSoundTask, DestroyAnimVisualTask, IsBattlerSpriteVisible } from "../anim";
import { registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning, CalculatePanIncrement, KeepPanInRange } from "../animScript";
import { gBattlerPartyIndexes } from "../globals";
import { GetBattlerSide } from "../util";
import { gBattleAnimArgs, gTasks, PlaySE1WithPanning, PlaySE12WithPanning, PlaySE2WithPanning, s16 } from "./common";

const s8 = (v: number) => (v << 24) >> 24;
const u16 = (v: number) => v & 0xffff;

function PlayCry_ByMode(species: number, pan: number, mode: number): void {
  sound.PlayCry_ByMode(species, pan, mode);
}

function IsCryPlaying(): boolean {
  return sound.isCryPlaying();
}

const BATTLE_PARTNER = (id: number) => id ^ 2;

// Loops the specified sound effect and pans from the
// attacker to the target. The second specified sound effect
// is played at the very end. This task is effectively
// hardcoded to the move FIRE_BLAST due to the baked-in
// durations.
// arg 0: looped sound effect
// arg 1: ending sound effect
export function SoundTask_FireBlast(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[0] = gBattleAnimArgs[0]!;
  t.data[1] = gBattleAnimArgs[1]!;
  const pan1 = s8(BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
  const pan2 = s8(BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
  const panIncrement = s8(CalculatePanIncrement(pan1, pan2, 2));
  t.data[2] = pan1;
  t.data[3] = pan2;
  t.data[4] = panIncrement;
  t.data[10] = 10;
  t.func = SoundTask_FireBlast_Step1;
}

function SoundTask_FireBlast_Step1(taskId: number): void {
  const t = gTasks[taskId]!;
  let pan = t.data[2]!;
  const panIncrement = s8(t.data[4]!);

  if (++t.data[11]! === 111) {
    t.data[10] = 5;
    t.data[11] = 0;
    t.func = SoundTask_FireBlast_Step2;
  } else {
    if (++t.data[10]! === 11) {
      t.data[10] = 0;
      PlaySE12WithPanning(t.data[0]!, pan);
    }
    pan = s16(pan + panIncrement);
    t.data[2] = s16(KeepPanInRange(pan, panIncrement));
  }
}

function SoundTask_FireBlast_Step2(taskId: number): void {
  const t = gTasks[taskId]!;
  if (++t.data[10]! === 6) {
    t.data[10] = 0;
    const pan = s8(BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
    PlaySE12WithPanning(t.data[1]!, pan);
    if (++t.data[11]! === 2) DestroyAnimSoundTask(taskId);
  }
}

export function SoundTask_LoopSEAdjustPanning(taskId: number): void {
  const t = gTasks[taskId]!;
  const songId = u16(gBattleAnimArgs[0]!);
  let targetPan = s8(gBattleAnimArgs[2]!);
  let panIncrement = s8(gBattleAnimArgs[3]!);
  const r10 = gBattleAnimArgs[4]! & 0xff;
  const r7 = gBattleAnimArgs[5]! & 0xff;
  const r9 = gBattleAnimArgs[6]! & 0xff;
  const sourcePan = s8(BattleAnimAdjustPanning(gBattleAnimArgs[1]!));

  targetPan = s8(BattleAnimAdjustPanning(targetPan));
  panIncrement = s8(CalculatePanIncrement(sourcePan, targetPan, panIncrement));
  t.data[0] = s16(songId);
  t.data[1] = sourcePan;
  t.data[2] = targetPan;
  t.data[3] = panIncrement;
  t.data[4] = r10;
  t.data[5] = r7;
  t.data[6] = r9;
  t.data[10] = 0;
  t.data[11] = sourcePan;
  t.data[12] = r9;
  t.func = SoundTask_LoopSEAdjustPanning_Step;
  t.func(taskId);
}

function SoundTask_LoopSEAdjustPanning_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[12]!++ === t.data[6]) {
    t.data[12] = 0;
    PlaySE12WithPanning(u16(t.data[0]!), t.data[11]!);
    t.data[4] = s16(t.data[4]! - 1);
    if (t.data[4] === 0) {
      DestroyAnimSoundTask(taskId);
      return;
    }
  }
  if (t.data[10]!++ === t.data[5]) {
    t.data[10] = 0;
    const dPan = u16(t.data[3]!);
    const oldPan = u16(t.data[11]!);
    t.data[11] = s16(dPan + oldPan);
    t.data[11] = s16(KeepPanInRange(t.data[11]!, oldPan));
  }
}

function wantedBattler(): number {
  const a = animState;
  if (gBattleAnimArgs[0] === C.ANIM_ATTACKER) return a.gBattleAnimAttacker;
  if (gBattleAnimArgs[0] === C.ANIM_TARGET) return a.gBattleAnimTarget;
  if (gBattleAnimArgs[0] === C.ANIM_ATK_PARTNER) return BATTLE_PARTNER(a.gBattleAnimAttacker);
  return BATTLE_PARTNER(a.gBattleAnimTarget);
}

function battlerSpecies(battlerId: number): number {
  if (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER)
    return GetMonData(gEnemyParty[gBattlerPartyIndexes[battlerId]!]!, C.MON_DATA_SPECIES);
  return GetMonData(playerMon(gBattlerPartyIndexes[battlerId]!), C.MON_DATA_SPECIES);
}

export function SoundTask_PlayCryHighPitch(taskId: number): void {
  const pan = s8(BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
  // Get wanted battler.
  const battlerId = wantedBattler();
  // Check if battler is visible.
  if ((gBattleAnimArgs[0] === C.ANIM_TARGET || gBattleAnimArgs[0] === C.ANIM_DEF_PARTNER)
   && !IsBattlerSpriteVisible(battlerId)) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const species = battlerSpecies(battlerId);
  if (species !== C.SPECIES_NONE) PlayCry_ByMode(species, pan, C.CRY_MODE_HIGH_PITCH);
  DestroyAnimVisualTask(taskId);
}

export function SoundTask_PlayDoubleCry(taskId: number): void {
  const t = gTasks[taskId]!;
  const pan = s8(BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
  // Get wanted battler.
  const battlerId = wantedBattler();
  // Check if battler is visible.
  if ((gBattleAnimArgs[0] === C.ANIM_TARGET || gBattleAnimArgs[0] === C.ANIM_DEF_PARTNER)
   && !IsBattlerSpriteVisible(battlerId)) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const species = battlerSpecies(battlerId);
  t.data[0] = gBattleAnimArgs[1]!;
  t.data[1] = s16(species);
  t.data[2] = pan;
  if (species !== C.SPECIES_NONE) {
    if (gBattleAnimArgs[1] === C.DOUBLE_CRY_GROWL)
      PlayCry_ByMode(species, pan, C.CRY_MODE_GROWL_1);
    else // DOUBLE_CRY_ROAR
      PlayCry_ByMode(species, pan, C.CRY_MODE_ROAR_1);
    t.func = SoundTask_PlayDoubleCry_Step;
  } else {
    DestroyAnimVisualTask(taskId);
  }
}

function SoundTask_PlayDoubleCry_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  const species = u16(t.data[1]!);
  const pan = s8(t.data[2]!);

  if (t.data[9]! < 2) {
    ++t.data[9]!;
  } else if (t.data[0] === C.DOUBLE_CRY_GROWL) {
    if (!IsCryPlaying()) {
      PlayCry_ByMode(species, pan, C.CRY_MODE_GROWL_2);
      DestroyAnimVisualTask(taskId);
    }
  } else { // DOUBLE_CRY_ROAR
    if (!IsCryPlaying()) {
      PlayCry_ByMode(species, pan, C.CRY_MODE_ROAR_2);
      DestroyAnimVisualTask(taskId);
    }
  }
}

export function SoundTask_WaitForCry(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[9]! < 2) ++t.data[9]!;
  else if (!IsCryPlaying()) DestroyAnimVisualTask(taskId);
}

// tSpecies data[1], tPan data[2], tState data[9]
export function SoundTask_PlayCryWithEcho(taskId: number): void {
  const t = gTasks[taskId]!;
  const pan = s8(BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
  const species = animState.gAnimBattlerSpecies[animState.gBattleAnimAttacker]!;
  t.data[1] = s16(species);
  t.data[2] = pan;
  if (species !== C.SPECIES_NONE) {
    PlayCry_ByMode(species, pan, C.CRY_MODE_ECHO_START);
    t.func = SoundTask_PlayCryWithEcho_Step;
  } else {
    DestroyAnimVisualTask(taskId);
  }
}

function SoundTask_PlayCryWithEcho_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[9]! < 2) {
    t.data[9]!++;
  } else if (!IsCryPlaying()) {
    const species = u16(t.data[1]!);
    const pan = s8(t.data[2]!);
    PlayCry_ByMode(species, pan, C.CRY_MODE_ECHO_END);
    DestroyAnimVisualTask(taskId);
  }
}

export function SoundTask_PlaySE1WithPanning(taskId: number): void {
  const songId = u16(gBattleAnimArgs[0]!);
  const pan = s8(BattleAnimAdjustPanning(gBattleAnimArgs[1]!));
  PlaySE1WithPanning(songId, pan);
  DestroyAnimVisualTask(taskId);
}

export function SoundTask_PlaySE2WithPanning(taskId: number): void {
  const songId = u16(gBattleAnimArgs[0]!);
  const pan = s8(BattleAnimAdjustPanning(gBattleAnimArgs[1]!));
  PlaySE2WithPanning(songId, pan);
  DestroyAnimVisualTask(taskId);
}

// Adjusts panning and assigns it to gAnimCustomPanning. Doesnt play sound.
// Used by Confuse Ray and Will-O-Wisp (see uses of gAnimCustomPanning)
export function SoundTask_AdjustPanningVar(taskId: number): void {
  const t = gTasks[taskId]!;
  let targetPan = s8(gBattleAnimArgs[1]!);
  let panIncrement = s8(gBattleAnimArgs[2]!);
  const r9 = u16(gBattleAnimArgs[3]!);
  const sourcePan = s8(BattleAnimAdjustPanning(gBattleAnimArgs[0]!));

  targetPan = s8(BattleAnimAdjustPanning(targetPan));
  panIncrement = s8(CalculatePanIncrement(sourcePan, targetPan, panIncrement));
  t.data[1] = sourcePan;
  t.data[2] = targetPan;
  t.data[3] = panIncrement;
  t.data[5] = s16(r9);
  t.data[10] = 0;
  t.data[11] = sourcePan;
  t.func = SoundTask_AdjustPanningVar_Step;
  t.func(taskId);
}

function SoundTask_AdjustPanningVar_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  const panIncrement = u16(t.data[3]!);
  if (t.data[10]!++ === t.data[5]) {
    t.data[10] = 0;
    const oldPan = u16(t.data[11]!);
    t.data[11] = s16(panIncrement + oldPan);
    t.data[11] = s16(KeepPanInRange(t.data[11]!, oldPan));
  }
  animState.gAnimCustomPanning = t.data[11]!;
  if (t.data[11] === t.data[2]) DestroyAnimVisualTask(taskId);
}

registerAnimTasks({
  SoundTask_FireBlast, SoundTask_LoopSEAdjustPanning, SoundTask_PlayCryHighPitch, SoundTask_PlayDoubleCry,
  SoundTask_WaitForCry, SoundTask_PlayCryWithEcho, SoundTask_PlaySE1WithPanning, SoundTask_PlaySE2WithPanning,
  SoundTask_AdjustPanningVar,
});
