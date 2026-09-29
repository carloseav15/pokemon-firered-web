// Port of battle_setup.c: trainerbattle argument parsing, trainer flags,
// wild/scripted battle starts and the end-of-battle callbacks.

import { sound } from "../audio/sound";
import { expandPlaceholders } from "../gba/charmap";
import { rom } from "../rom";
import { clearRematchStateOfLastTalked, getRematchTrainerId } from "../field/vsSeeker";
import { afterRoamerBattle } from "../pokemon/roamer";
import { CreateScriptedWildMon } from "../pokemon/scriptPokemonUtil";
import { gEnemyParty } from "../pokemon/mon";
import { checkBagHasItem } from "../pokemon/items";
import { incrementGameStat } from "../save";
import { flagClear, flagGet, flagSet, save, SV, varSet } from "../save";
import { createMaleMon, createMon, genderFromPersonality, healMon, MON_FEMALE, type Pokemon } from "../pokemon/pokemon";
import { random32 } from "../random";
import type { Game } from "../game";
import { GetSafariZoneFlag } from "../field/safariZone";
import { QL_FinishRecordingScene } from "../questLogEvents";

export const TRAINER_BATTLE_SINGLE = 0;
export const TRAINER_BATTLE_CONTINUE_SCRIPT_NO_MUSIC = 1;
export const TRAINER_BATTLE_CONTINUE_SCRIPT = 2;
export const TRAINER_BATTLE_SINGLE_NO_INTRO_TEXT = 3;
export const TRAINER_BATTLE_DOUBLE = 4;
export const TRAINER_BATTLE_REMATCH = 5;
export const TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE = 6;
export const TRAINER_BATTLE_REMATCH_DOUBLE = 7;
export const TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE_NO_MUSIC = 8;
export const TRAINER_BATTLE_EARLY_RIVAL = 9;

export const RIVAL_BATTLE_HEAL_AFTER = 1;
export const RIVAL_BATTLE_TUTORIAL = 3;

export const B_OUTCOME_WON = 1, B_OUTCOME_LOST = 2, B_OUTCOME_DREW = 3, B_OUTCOME_RAN = 4, B_OUTCOME_PLAYER_TELEPORTED = 5, B_OUTCOME_MON_FLED = 6, B_OUTCOME_CAUGHT = 7;

/** IsPlayerDefeated (battle_setup.c): only LOST and DREW count as player defeat. */
function IsPlayerDefeated(battleOutcome: number): boolean {
  switch (battleOutcome) {
    case B_OUTCOME_LOST:
    case B_OUTCOME_DREW:
      return true;
    case B_OUTCOME_WON:
    case B_OUTCOME_RAN:
    case B_OUTCOME_PLAYER_TELEPORTED:
    case B_OUTCOME_MON_FLED:
    case B_OUTCOME_CAUGHT:
    default:
      return false;
  }
}

type Param = "u8" | "u16" | "u32" | "clear8" | "clear16" | "clear32" | "ret";

// Order: mode, opponentA, localId/rivalFlags, intro, defeat, victory, cannotBattle, battleScriptRetAddr, endScript
const ORDINARY: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear32", "clear32", "clear32", "ret"];
const CONTINUE_SCRIPT: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear32", "clear32", "u32", "ret"];
const DOUBLE: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear32", "u32", "clear32", "ret"];
const NO_INTRO: Param[] = ["u8", "u16", "u16", "clear32", "u32", "clear32", "clear32", "clear32", "ret"];
const EARLY_RIVAL: Param[] = ["u8", "u16", "u16", "clear32", "u32", "u32", "clear32", "clear32", "ret"];
const CONTINUE_DOUBLE: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear32", "u32", "u32", "ret"];

type TrainerBattleArgField = "mode" | "opponentA" | "localId" | "rivalFlags" | "introSpeech" | "defeatSpeech" | "victorySpeech" | "cannotBattleSpeech" | "battleScriptRetAddr" | "endScript";
type TrainerBattleArgTarget = Record<TrainerBattleArgField, number>;

/** ReturnEmptyStringIfNull (battle_setup.c): gString_Dummy is a one-byte EOS string. */
function ReturnEmptyStringIfNull(value: Uint8Array | null | undefined): Uint8Array {
  return value ?? new Uint8Array([0xff]);
}

/** TrainerBattleLoadArg8 (battle_setup.c): load one little-endian unsigned byte. */
function TrainerBattleLoadArg8(ptr: number): number { return rom.u8(ptr) & 0xff; }

/** TrainerBattleLoadArg16 (battle_setup.c): load one little-endian unsigned halfword. */
function TrainerBattleLoadArg16(ptr: number): number { return rom.u16(ptr) & 0xffff; }

/** TrainerBattleLoadArg32 (battle_setup.c): load one little-endian unsigned word. */
function TrainerBattleLoadArg32(ptr: number): number { return rom.u32(ptr) >>> 0; }

/** SetU8 (battle_setup.c): store the low byte in the corresponding saved battle field. */
function SetU8(target: TrainerBattleArgTarget, field: TrainerBattleArgField, value: number): void { target[field] = value & 0xff; }

/** SetU16 (battle_setup.c): store the low halfword in the corresponding saved battle field. */
function SetU16(target: TrainerBattleArgTarget, field: TrainerBattleArgField, value: number): void { target[field] = value & 0xffff; }

/** SetU32 (battle_setup.c): store the unsigned word in the corresponding saved battle field. */
function SetU32(target: TrainerBattleArgTarget, field: TrainerBattleArgField, value: number): void { target[field] = value >>> 0; }

/** SetPtr (battle_setup.c): retain the ROM address as the target's 32-bit script pointer. */
function SetPtr(target: TrainerBattleArgTarget, field: TrainerBattleArgField, value: number): void { target[field] = value >>> 0; }

/** TrainerBattleLoadArgs (battle_setup.c): consume the exact field widths and stop at the return pointer. */
function TrainerBattleLoadArgs(target: TrainerBattleArgTarget, specs: readonly Param[], ptr: number): void {
  const fields: readonly TrainerBattleArgField[] = ["mode", "opponentA", "localId", "introSpeech", "defeatSpeech", "victorySpeech", "cannotBattleSpeech", "battleScriptRetAddr", "endScript"];
  let data = ptr;
  for (let i = 0; i < specs.length; i++) {
    const field = fields[i]!;
    switch (specs[i]) {
      case "u8": SetU8(target, field, TrainerBattleLoadArg8(data)); data += 1; break;
      case "u16": SetU16(target, field, TrainerBattleLoadArg16(data)); data += 2; break;
      case "u32": SetU32(target, field, TrainerBattleLoadArg32(data)); data += 4; break;
      case "clear8": SetU8(target, field, 0); break;
      case "clear16": SetU16(target, field, 0); break;
      case "clear32": SetU32(target, field, 0); break;
      case "ret": SetPtr(target, field, data); return;
    }
  }
}

export type BattleRequest = {
  kind: "wild" | "trainer";
  trainerId?: number;
  enemyParty: Pokemon[];
  isFirstBattle?: boolean;
  isOldMan?: boolean;
  isLegendary?: boolean;
  isLegendaryFrlg?: boolean;
  isRegi?: boolean;
  isKyogreGroudon?: boolean;
  isGhost?: boolean;
  isGhostUnveiled?: boolean;
  isSafari?: boolean;
  isRoamer?: boolean;
  isDouble?: boolean;
  terrain?: string;
  music?: number;
  onEnd: (outcome: number) => void;
};

export class BattleSetup {
  mode = 0;
  opponentA = 0;
  localId = 0;
  rivalFlags = 0;
  introSpeech = 0;
  defeatSpeech = 0;
  victorySpeech = 0;
  cannotBattleSpeech = 0;
  battleScriptRetAddr = 0;
  endScript = 0;
  private scriptedWild?: Pokemon;

  constructor(private readonly game: Game) {}

  private setMapVarsToTrainer(): void {
    if (this.localId !== 0) {
      varSet(SV.LAST_TALKED, this.localId);
      const objects = this.game.overworld.objects;
      const o = objects.byLocalIdAndMap(this.localId, save.location.mapNum, save.location.mapGroup);
      // Source lookup returns OBJECT_EVENTS_COUNT when the trainer is absent.
      this.game.overworld.selectedObject = o ? objects.indexOf(o) : objects.objects.length;
    }
  }

  /** InitTrainerBattleVariables (battle_setup.c). */
  private InitTrainerBattleVariables(): void {
    this.mode = this.opponentA = this.localId = this.rivalFlags = this.introSpeech = this.defeatSpeech = this.victorySpeech = this.cannotBattleSpeech = this.battleScriptRetAddr = this.endScript = 0;
  }

  /** BattleSetup_ConfigureTrainerBattle: returns the script to jump to. */
  BattleSetup_ConfigureTrainerBattle(ptr: number): number {
    this.InitTrainerBattleVariables();
    const mode = rom.u8(ptr);
    switch (mode) {
      case TRAINER_BATTLE_SINGLE_NO_INTRO_TEXT:
        TrainerBattleLoadArgs(this, NO_INTRO, ptr);
        return rom.label("EventScript_DoNoIntroTrainerBattle");
      case TRAINER_BATTLE_DOUBLE:
        TrainerBattleLoadArgs(this, DOUBLE, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoDoubleTrainerBattle");
      case TRAINER_BATTLE_CONTINUE_SCRIPT:
      case TRAINER_BATTLE_CONTINUE_SCRIPT_NO_MUSIC:
        TrainerBattleLoadArgs(this, CONTINUE_SCRIPT, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoNormalTrainerBattle");
      case TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE:
      case TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE_NO_MUSIC:
        TrainerBattleLoadArgs(this, CONTINUE_DOUBLE, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoDoubleTrainerBattle");
      case TRAINER_BATTLE_REMATCH_DOUBLE:
        QL_FinishRecordingScene();
        TrainerBattleLoadArgs(this, DOUBLE, ptr);
        this.setMapVarsToTrainer();
        this.opponentA = getRematchTrainerId(this.opponentA);
        return rom.label("EventScript_TryDoDoubleRematchBattle");
      case TRAINER_BATTLE_REMATCH:
        QL_FinishRecordingScene();
        TrainerBattleLoadArgs(this, ORDINARY, ptr);
        this.setMapVarsToTrainer();
        this.opponentA = getRematchTrainerId(this.opponentA);
        return rom.label("EventScript_TryDoRematchBattle");
      case TRAINER_BATTLE_EARLY_RIVAL:
        TrainerBattleLoadArgs(this, EARLY_RIVAL, ptr);
        this.rivalFlags = this.localId;
        this.localId = 0;
        return rom.label("EventScript_DoNoIntroTrainerBattle");
      default:
        TrainerBattleLoadArgs(this, ORDINARY, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoNormalTrainerBattle");
    }
  }

  /** GetTrainerFlagFromScriptPointer (battle_setup.c). */
  GetTrainerFlagFromScriptPointer(data: number): boolean {
    const trainerId = rom.u16(data + 2);
    return this.HasTrainerBeenFought(trainerId);
  }

  /** ConfigureAndSetUpOneTrainerBattle (battle_setup.c), called when a trainer spots the player. */
  ConfigureAndSetUpOneTrainerBattle(objectIndex: number, trainerScript: number): void {
    const ow = this.game.overworld;
    ow.selectedObject = objectIndex;
    const o = ow.objects.objects[objectIndex];
    if (o) varSet(SV.LAST_TALKED, o.localId);
    this.BattleSetup_ConfigureTrainerBattle(trainerScript + 1);
    ow.script.ScriptContext_SetupScript(rom.label("EventScript_DoTrainerBattleFromApproach"));
    ow.controlsLocked = true;
  }

  private GetTrainerAFlag(): number {
    return rom.c("TRAINER_FLAGS_START") + this.opponentA;
  }

  /** Script_HasTrainerBeenFought (battle_setup.c): read the current trainer A flag. */
  Script_HasTrainerBeenFought(): boolean {
    return flagGet(this.GetTrainerAFlag());
  }

  private trainerFlag(trainerId: number): number {
    return rom.c("TRAINER_FLAGS_START") + trainerId;
  }

  HasTrainerBeenFought(trainerId: number): boolean {
    return flagGet(this.trainerFlag(trainerId));
  }

  SetTrainerFlag(trainerId: number): void { flagSet(this.trainerFlag(trainerId)); }
  ClearTrainerFlag(trainerId: number): void { flagClear(this.trainerFlag(trainerId)); }
  SetBattledTrainerFlag(): void { flagSet(this.GetTrainerAFlag()); }
  /** SetBattledTrainerFlag2 (battle_setup.c): unused, byte-identical to SetBattledTrainerFlag. */
  SetBattledTrainerFlag2(): void { this.SetBattledTrainerFlag(); }

  /** pokemon.c GetBattleBGM, with explicit CreateBattleStartTask song overrides. */
  battleBgm(request: BattleRequest): number {
    if (request.music) return request.music;
    const c = rom.constants;
    if (request.isKyogreGroudon) return c.MUS_VS_WILD;
    if (request.isRegi) return c.MUS_RS_VS_TRAINER;
    if (request.kind !== "trainer") return c.MUS_VS_WILD;
    const trainerClass = rom.trainers[request.trainerId ?? 0]?.class;
    if (trainerClass === c.TRAINER_CLASS_CHAMPION) return c.MUS_VS_CHAMPION;
    if (trainerClass === c.TRAINER_CLASS_LEADER || trainerClass === c.TRAINER_CLASS_ELITE_FOUR)
      return c.MUS_VS_GYM_LEADER;
    return c.MUS_VS_TRAINER;
  }

  BattleSetup_GetScriptAddrAfterBattle(): number {
    return this.endScript || rom.label("EventScript_TestSignpostMsg");
  }

  BattleSetup_GetTrainerPostBattleScript(): number {
    return this.battleScriptRetAddr || rom.label("EventScript_TestSignpostMsg");
  }

  /** GetIntroSpeechOfApproachingTrainer (battle_setup.c). */
  private GetIntroSpeechOfApproachingTrainer(): Uint8Array {
    return ReturnEmptyStringIfNull(this.introSpeech ? rom.stringAt(this.introSpeech) : null);
  }

  ShowTrainerIntroSpeech(): void {
    this.game.overworld.messageBox.show(this.GetIntroSpeechOfApproachingTrainer());
  }

  /** GetTrainerCantBattleSpeech (battle_setup.c). */
  private GetTrainerCantBattleSpeech(): Uint8Array {
    return ReturnEmptyStringIfNull(this.cannotBattleSpeech ? rom.stringAt(this.cannotBattleSpeech) : null);
  }

  ShowTrainerCantBattleSpeech(): void {
    this.game.overworld.messageBox.show(this.GetTrainerCantBattleSpeech());
  }

  GetTrainerALoseText(): Uint8Array {
    const string = this.defeatSpeech ? rom.stringAt(this.defeatSpeech) : null;
    return expandPlaceholders(ReturnEmptyStringIfNull(string));
  }

  GetTrainerWonSpeech(): Uint8Array {
    const string = this.victorySpeech ? rom.stringAt(this.victorySpeech) : null;
    return expandPlaceholders(ReturnEmptyStringIfNull(string));
  }

  playEncounterMusic(): void {
    if (this.mode === TRAINER_BATTLE_CONTINUE_SCRIPT_NO_MUSIC || this.mode === TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE_NO_MUSIC) return;
    const c = rom.constants;
    const music = rom.trainers[this.opponentA]?.music ?? 0;
    let song = c.MUS_ENCOUNTER_ROCKET;
    if ([c.TRAINER_ENCOUNTER_MUSIC_FEMALE, c.TRAINER_ENCOUNTER_MUSIC_GIRL, c.TRAINER_ENCOUNTER_MUSIC_TWINS].includes(music)) song = c.MUS_ENCOUNTER_GIRL;
    else if ([c.TRAINER_ENCOUNTER_MUSIC_MALE, c.TRAINER_ENCOUNTER_MUSIC_INTENSE, c.TRAINER_ENCOUNTER_MUSIC_COOL, c.TRAINER_ENCOUNTER_MUSIC_SWIMMER, c.TRAINER_ENCOUNTER_MUSIC_ELITE_FOUR, c.TRAINER_ENCOUNTER_MUSIC_HIKER, c.TRAINER_ENCOUNTER_MUSIC_INTERVIEWER, c.TRAINER_ENCOUNTER_MUSIC_RICH].includes(music)) song = c.MUS_ENCOUNTER_BOY;
    sound.playNewMapMusic(song);
  }

  /** CreateNPCTrainerParty */
  trainerParty(trainerId: number): Pokemon[] {
    const trainer = rom.trainers[trainerId];
    if (!trainer) return [];
    const party: Pokemon[] = [];
    for (const member of trainer.party) {
      // Personality from the trainer name and species (nameHash + species), fixed IVs.
      let nameHash = 0;
      const name = atob(trainer.name);
      for (let j = 0; j < name.length && name.charCodeAt(j) !== 0xff; j++) nameHash += name.charCodeAt(j);
      const personalityValue = ((nameHash + member.species) & 0xff) << 8 | (trainer.female ? 0x78 : 0x88);
      const fixedIV = Math.floor((member.iv * 31) / 255);
      const mon = createMon(member.species, member.level, { fixedIV, personality: personalityValue, otId: 0 });
      if (member.item) mon.heldItem = member.item;
      if (member.moves) {
        mon.moves = [...member.moves];
        mon.pp = mon.moves.map((m) => (m ? rom.moves[m].pp : 0));
      }
      party.push(mon);
    }
    return party;
  }

  startTrainerBattle(rematch = false): void {
    const ow = this.game.overworld;
    const firstBattle = this.mode === TRAINER_BATTLE_EARLY_RIVAL && (this.rivalFlags & RIVAL_BATTLE_TUTORIAL) === RIVAL_BATTLE_TUTORIAL;
    const trainer = rom.trainers[this.opponentA];
    ow.script.ScriptContext_Stop();
    this.DoTrainerBattle({
      kind: "trainer",
      trainerId: this.opponentA,
      enemyParty: this.trainerParty(this.opponentA),
      isFirstBattle: firstBattle,
      isDouble: !!trainer?.double && this.mode !== TRAINER_BATTLE_EARLY_RIVAL,
      onEnd: (outcome) => rematch ? this.CB2_EndRematchBattle(outcome) : this.CB2_EndTrainerBattle(outcome),
    });
  }

  /** DoTrainerBattle (battle_setup.c): start the battle transition and account for both battle stats. */
  private DoTrainerBattle(request: BattleRequest): void {
    incrementGameStat(rom.c("GAME_STAT_TOTAL_BATTLES"));
    incrementGameStat(rom.c("GAME_STAT_TRAINER_BATTLES"));
    this.game.startBattle(request);
  }

  private CB2_EndTrainerBattle(outcome: number): void {
    this.game.battleOutcome = outcome;
    const lost = IsPlayerDefeated(outcome);
    if (this.mode === TRAINER_BATTLE_EARLY_RIVAL) {
      if (lost) {
        varSet(SV.RESULT, 1);
        if (this.rivalFlags & RIVAL_BATTLE_HEAL_AFTER) {
          for (const mon of save.party) healMon(mon);
        } else {
          this.game.whiteOut();
          return;
        }
      } else {
        varSet(SV.RESULT, 0);
      }
      this.SetBattledTrainerFlag();
      this.game.returnToFieldContinueScript(true);
      return;
    }
    if (this.opponentA === rom.c("TRAINER_SECRET_BASE")) {
      this.game.returnToFieldContinueScript(true);
      return;
    }
    if (lost) {
      this.game.whiteOut();
      return;
    }
    this.SetBattledTrainerFlag();
    this.game.returnToFieldContinueScript(true);
  }

  /** CB2_EndRematchBattle (battle_setup.c). */
  private CB2_EndRematchBattle(outcome: number): void {
    this.game.battleOutcome = outcome;
    if (this.opponentA === rom.c("TRAINER_SECRET_BASE")) {
      this.game.returnToFieldContinueScript(true);
    } else if (IsPlayerDefeated(outcome)) {
      this.game.whiteOut();
    } else {
      this.game.returnToFieldContinueScript(true);
      this.SetBattledTrainerFlag();
      clearRematchStateOfLastTalked();
    }
  }

  createScriptedWildMon(species: number, level: number, item: number): void {
    CreateScriptedWildMon(species, level, item);
    this.scriptedWild = structuredClone(gEnemyParty[0]);
  }

  /** CheckSilphScopeInPokemonTower (battle_setup.c): true means the encounter remains a ghost. */
  private CheckSilphScopeInPokemonTower(): boolean {
    const map = (save.location.mapGroup << 8) | save.location.mapNum;
    const c = rom.constants;
    const inPokemonTower = [1, 2, 3, 4, 5, 6, 7].some(floor => map === c[`MAP_POKEMON_TOWER_${floor}F`]);
    return inPokemonTower && !checkBagHasItem(c.ITEM_SILPH_SCOPE, 1);
  }

  /** StartWildBattle (battle_setup.c) dispatches the active Safari, ghost, or standard route. */
  StartWildBattle(enemy: Pokemon): void {
    if (GetSafariZoneFlag()) {
      this.DoSafariBattle(enemy);
    } else if (this.CheckSilphScopeInPokemonTower()) {
      this.DoGhostBattle(enemy);
    } else {
      this.DoStandardWildBattle(enemy);
    }
  }

  private DoStandardWildBattle(enemy: Pokemon): void {
    this.StartOrdinaryWildBattle(enemy, false);
  }

  private DoGhostBattle(enemy: Pokemon): void {
    enemy.nickname = Array.from(rom.text("gText_Ghost"));
    this.StartOrdinaryWildBattle(enemy, true);
  }

  private StartOrdinaryWildBattle(enemy: Pokemon, isGhost: boolean): void {
    const c = rom.constants;
    incrementGameStat(c.GAME_STAT_TOTAL_BATTLES);
    incrementGameStat(c.GAME_STAT_WILD_BATTLES);
    this.game.startBattle({
      kind: "wild", enemyParty: [enemy], isGhost,
      onEnd: outcome => this.CB2_EndWildBattle(outcome),
    });
  }

  private DoSafariBattle(enemy: Pokemon): void {
    this.game.startBattle({
      kind: "wild", enemyParty: [enemy], isSafari: true,
      onEnd: outcome => {
        this.game.battleOutcome = outcome;
        this.CB2_EndSafariBattle(outcome);
      },
    });
  }

  /** safari_zone.c CB2_EndSafariBattle */
  private CB2_EndSafariBattle(outcome: number): void {
    const game = this.game, ow = game.overworld;
    if (game.safariBalls !== 0) { game.returnToFieldContinueScript(true); return; }
    if (outcome === rom.c("B_OUTCOME_NO_SAFARI_BALLS")) {
      game.scene = null;
      ow.script.RunScriptImmediately(rom.label("SafariZone_EventScript_OutOfBallsMidBattle"));
      ow.fieldCallback = () => ow.FieldCB_SafariZoneRanOutOfBalls();
      ow.warpIntoMapAndLoad();
      return;
    }
    // B_OUTCOME_CAUGHT with the last ball
    ow.script.ScriptContext_SetupScript(rom.label("SafariZone_EventScript_OutOfBalls"));
    ow.script.ScriptContext_Stop();
    game.returnToFieldContinueScript(true);
  }

  /** CB2_EndWildBattle (battle_setup.c); the browser field uses its shared continuation callback. */
  private CB2_EndWildBattle(outcome: number): void {
    this.game.battleOutcome = outcome;
    if (IsPlayerDefeated(outcome)) this.game.whiteOut();
    else this.game.returnToFieldContinueScript(true);
  }

  /** CB2_EndScriptedWildBattle (battle_setup.c). */
  private CB2_EndScriptedWildBattle(outcome: number): void {
    this.game.battleOutcome = outcome;
    if (IsPlayerDefeated(outcome)) this.game.whiteOut();
    else this.game.returnToFieldContinueScript(true);
  }

  /** CB2_EndMarowakBattle (battle_setup.c). */
  private CB2_EndMarowakBattle(outcome: number): void {
    this.game.battleOutcome = outcome;
    if (IsPlayerDefeated(outcome)) this.game.whiteOut();
    else {
      varSet(SV.RESULT, outcome === B_OUTCOME_WON ? 0 : 1);
      this.game.returnToFieldContinueScript(true);
    }
  }

  /** battle_setup.c StartRoamerBattle (BATTLE_TYPE_ROAMER), with UpdateRoamerHPStatus afterwards. */
  startRoamerBattle(enemy: Pokemon): void {
    incrementGameStat(rom.c("GAME_STAT_TOTAL_BATTLES"));
    incrementGameStat(rom.c("GAME_STAT_WILD_BATTLES"));
    this.game.startBattle({
      kind: "wild", enemyParty: [enemy], isRoamer: true,
      music: rom.c("MUS_VS_LEGEND"),
      onEnd: (outcome) => {
        afterRoamerBattle(gEnemyParty[0] as unknown as Pokemon, outcome);
        this.CB2_EndWildBattle(outcome);
      },
    });
  }

  startScriptedWildBattle(): void {
    const enemy = this.scriptedWild ?? createMon(1, 5);
    this.game.startBattle({
      kind: "wild",
      enemyParty: [enemy],
      onEnd: (outcome) => this.CB2_EndScriptedWildBattle(outcome),
    });
  }

  startLegendaryBattle(): void {
    this.startLegendaryWild({ isLegendaryFrlg: true });
  }

  startSouthernIslandBattle(): void {
    this.startLegendaryWild({}, 0);
  }

  startRegiBattle(): void {
    this.startLegendaryWild({ isRegi: true }, rom.c("MUS_RS_VS_TRAINER"));
  }

  startGroudonKyogreBattle(): void {
    this.startLegendaryWild({ isKyogreGroudon: true }, rom.c("MUS_RS_VS_TRAINER"));
  }

  private startLegendaryWild(
    flags: Pick<BattleRequest, "isRegi" | "isKyogreGroudon" | "isLegendaryFrlg">,
    musicOverride?: number,
  ): void {
    const ow = this.game.overworld;
    ow.script.ScriptContext_Stop();
    const enemy = this.scriptedWild ?? createMon(1, 5);
    const species = enemy.species;
    const music = species === rom.c("SPECIES_MEWTWO") ? rom.c("MUS_VS_MEWTWO")
      : species === rom.c("SPECIES_DEOXYS") ? rom.c("MUS_VS_DEOXYS")
        : ["SPECIES_MOLTRES", "SPECIES_ARTICUNO", "SPECIES_ZAPDOS", "SPECIES_HO_OH", "SPECIES_LUGIA"].some(name => species === rom.c(name))
          ? rom.c("MUS_VS_LEGEND") : rom.c("MUS_RS_VS_TRAINER");
    const battleMusic = musicOverride ?? music;
    this.game.startBattle({
      kind: "wild",
      isLegendary: true,
      ...flags,
      ...(battleMusic ? { music: battleMusic } : {}),
      enemyParty: [enemy],
      onEnd: (outcome) => this.CB2_EndScriptedWildBattle(outcome),
    });
  }

  startMarowakBattle(): void {
    const ow = this.game.overworld;
    ow.script.ScriptContext_Stop();
    const species = rom.c("SPECIES_MAROWAK");
    const hasSilphScope = checkBagHasItem(rom.c("ITEM_SILPH_SCOPE"), 1);
    let marowak: Pokemon;
    if (hasSilphScope) {
      let personality: number;
      do personality = random32();
      while ((personality >>> 0) % 25 !== rom.c("NATURE_SERIOUS")
        || genderFromPersonality(species, personality) !== MON_FEMALE);
      marowak = createMon(species, 30, { fixedIV: 31, personality });
    } else {
      marowak = createMon(species, 30);
    }
    marowak.nickname = Array.from(rom.text("gText_Ghost"));
    this.game.startBattle({
      kind: "wild",
      isGhost: true,
      isGhostUnveiled: hasSilphScope,
      enemyParty: [marowak],
      onEnd: (outcome) => this.CB2_EndMarowakBattle(outcome),
    });
  }

  startOldManTutorialBattle(): void {
    const ow = this.game.overworld;
    ow.script.ScriptContext_Stop();
    this.game.startBattle({
      kind: "wild",
      isOldMan: true,
      enemyParty: [createMaleMon(rom.c("SPECIES_WEEDLE"), 5)],
      onEnd: () => this.game.returnToFieldContinueScript(true),
    });
  }

  /** StartPokedudeBattle (battle_setup.c:411) */
  startPokedudeBattle(): void {
    const ow = this.game.overworld;
    ow.script.ScriptContext_Stop();
    this.game.startBattle({
      kind: "wild",
      enemyParty: [createMon(rom.c("SPECIES_RATTATA"), 3)],
      onEnd: (outcome) => this.EndPokedudeBattle(outcome),
    });
  }

  /** EndPokedudeBattle (battle_setup.c:404) */
  EndPokedudeBattle(outcome: number): void {
    this.CB2_EndWildBattle(outcome);
  }
}

/** BattleSetup_GetBattleTowerBattleTransition (battle_setup.c:660) */
export function BattleSetup_GetBattleTowerBattleTransition(): number {
  const enemyLevel = gEnemyParty[0]?.level ?? 1;
  let playerLevel = 0;
  for (const mon of save.party) {
    if (mon.isEgg || mon.species === 0 || mon.hp === 0) continue;
    playerLevel = (playerLevel + mon.level) & 0xff;
    break;
  }
  if (enemyLevel < playerLevel) {
    return rom.c("B_TRANSITION_POKEBALLS_TRAIL");
  } else {
    return rom.c("B_TRANSITION_BIG_POKEBALL");
  }
}

/** StartPokedudeBattle (battle_setup.c:411) */
export function StartPokedudeBattle(setup?: BattleSetup): void {
  setup?.startPokedudeBattle();
}

/** EndPokedudeBattle (battle_setup.c:404) */
export function EndPokedudeBattle(setup?: BattleSetup, outcome: number = B_OUTCOME_WON): void {
  setup?.EndPokedudeBattle(outcome);
}
