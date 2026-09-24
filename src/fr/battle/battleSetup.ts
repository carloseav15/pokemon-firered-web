// Port of battle_setup.c: trainerbattle argument parsing, trainer flags,
// wild/scripted battle starts and the end-of-battle callbacks.

import { sound } from "../audio/sound";
import { expandPlaceholders } from "../gba/charmap";
import { rom } from "../rom";
import { flagClear, flagGet, flagSet, save, SV, varSet } from "../save";
import { createMon, healMon, type Pokemon } from "../pokemon/pokemon";
import type { Game } from "../game";

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

type Param = "u8" | "u16" | "u32" | "clear" | "ret";

// Order: mode, opponentA, localId/rivalFlags, intro, defeat, victory, cannotBattle, battleScriptRetAddr, endScript
const ORDINARY: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear", "clear", "clear", "ret"];
const CONTINUE_SCRIPT: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear", "clear", "u32", "ret"];
const DOUBLE: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear", "u32", "clear", "ret"];
const NO_INTRO: Param[] = ["u8", "u16", "u16", "clear", "u32", "clear", "clear", "clear", "ret"];
const EARLY_RIVAL: Param[] = ["u8", "u16", "u16", "clear", "u32", "u32", "clear", "clear", "ret"];
const CONTINUE_DOUBLE: Param[] = ["u8", "u16", "u16", "u32", "u32", "clear", "u32", "u32", "ret"];

export type BattleRequest = {
  kind: "wild" | "trainer";
  trainerId?: number;
  enemyParty: Pokemon[];
  isFirstBattle?: boolean;
  isOldMan?: boolean;
  isLegendary?: boolean;
  isGhost?: boolean;
  isSafari?: boolean;
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

  private load(specs: Param[], ptr: number): void {
    const fields = ["mode", "opponentA", "localId", "introSpeech", "defeatSpeech", "victorySpeech", "cannotBattleSpeech", "battleScriptRetAddr", "endScript"] as const;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const field = fields[i];
      switch (spec) {
        case "u8": (this as unknown as Record<string, number>)[field] = rom.u8(ptr); ptr += 1; break;
        case "u16": (this as unknown as Record<string, number>)[field] = rom.u16(ptr); ptr += 2; break;
        case "u32": (this as unknown as Record<string, number>)[field] = rom.u32(ptr); ptr += 4; break;
        case "clear": (this as unknown as Record<string, number>)[field] = 0; break;
        case "ret": this.endScript = ptr; return;
      }
    }
  }

  private setMapVarsToTrainer(): void {
    if (this.localId !== 0) {
      varSet(SV.LAST_TALKED, this.localId);
      const o = this.game.overworld.objects.byLocalId(this.localId);
      if (o) this.game.overworld.selectedObject = this.game.overworld.objects.indexOf(o);
    }
  }

  /** BattleSetup_ConfigureTrainerBattle: returns the script to jump to. */
  configureTrainerBattle(ptr: number): number {
    this.mode = this.opponentA = this.localId = this.rivalFlags = this.introSpeech = this.defeatSpeech = this.victorySpeech = this.cannotBattleSpeech = this.battleScriptRetAddr = this.endScript = 0;
    const mode = rom.u8(ptr);
    switch (mode) {
      case TRAINER_BATTLE_SINGLE_NO_INTRO_TEXT:
        this.load(NO_INTRO, ptr);
        return rom.label("EventScript_DoNoIntroTrainerBattle");
      case TRAINER_BATTLE_DOUBLE:
        this.load(DOUBLE, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoDoubleTrainerBattle");
      case TRAINER_BATTLE_CONTINUE_SCRIPT:
      case TRAINER_BATTLE_CONTINUE_SCRIPT_NO_MUSIC:
        this.load(CONTINUE_SCRIPT, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoNormalTrainerBattle");
      case TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE:
      case TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE_NO_MUSIC:
        this.load(CONTINUE_DOUBLE, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoDoubleTrainerBattle");
      case TRAINER_BATTLE_REMATCH_DOUBLE:
        this.load(DOUBLE, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoDoubleRematchBattle");
      case TRAINER_BATTLE_REMATCH:
        this.load(ORDINARY, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoRematchBattle");
      case TRAINER_BATTLE_EARLY_RIVAL:
        this.load(EARLY_RIVAL, ptr);
        this.rivalFlags = this.localId;
        this.localId = 0;
        return rom.label("EventScript_DoNoIntroTrainerBattle");
      default:
        this.load(ORDINARY, ptr);
        this.setMapVarsToTrainer();
        return rom.label("EventScript_TryDoNormalTrainerBattle");
    }
  }

  /** Called by trainer_see when a trainer spots the player. */
  configureFromApproach(objectIndex: number, trainerScript: number): void {
    const ow = this.game.overworld;
    ow.selectedObject = objectIndex;
    const o = ow.objects.objects[objectIndex];
    if (o) varSet(SV.LAST_TALKED, o.localId);
    this.configureTrainerBattle(trainerScript + 1);
    ow.script.setupScript(rom.label("EventScript_DoTrainerBattleFromApproach"));
    ow.controlsLocked = true;
  }

  trainerFlag(trainerId = this.opponentA): number {
    return rom.c("TRAINER_FLAGS_START") + trainerId;
  }

  hasTrainerBeenFought(trainerId: number): boolean {
    return flagGet(this.trainerFlag(trainerId));
  }

  setTrainerFlag(trainerId: number): void { flagSet(this.trainerFlag(trainerId)); }
  clearTrainerFlag(trainerId: number): void { flagClear(this.trainerFlag(trainerId)); }
  setBattledTrainerFlag(): void { flagSet(this.trainerFlag()); }

  scriptAddrAfterBattle(): number {
    return this.endScript || rom.label("EventScript_TestSignpostMsg");
  }

  trainerPostBattleScript(): number {
    return this.battleScriptRetAddr || rom.label("EventScript_TestSignpostMsg");
  }

  showIntroSpeech(): void {
    this.game.overworld.messageBox.show(this.introSpeech ? rom.stringAt(this.introSpeech) : new Uint8Array([0xff]));
  }

  showCantBattleSpeech(): void {
    this.game.overworld.messageBox.show(this.cannotBattleSpeech ? rom.stringAt(this.cannotBattleSpeech) : new Uint8Array([0xff]));
  }

  loseText(): Uint8Array {
    return expandPlaceholders(this.defeatSpeech ? rom.stringAt(this.defeatSpeech) : new Uint8Array([0xff]));
  }

  wonText(): Uint8Array {
    return expandPlaceholders(this.victorySpeech ? rom.stringAt(this.victorySpeech) : new Uint8Array([0xff]));
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

  startTrainerBattle(): void {
    const ow = this.game.overworld;
    const firstBattle = this.mode === TRAINER_BATTLE_EARLY_RIVAL && (this.rivalFlags & RIVAL_BATTLE_TUTORIAL) === RIVAL_BATTLE_TUTORIAL;
    const trainer = rom.trainers[this.opponentA];
    ow.script.stop();
    this.game.startBattle({
      kind: "trainer",
      trainerId: this.opponentA,
      enemyParty: this.trainerParty(this.opponentA),
      isFirstBattle: firstBattle,
      isDouble: !!trainer?.double && this.mode !== TRAINER_BATTLE_EARLY_RIVAL,
      onEnd: (outcome) => this.endTrainerBattle(outcome),
    });
  }

  private endTrainerBattle(outcome: number): void {
    const lost = outcome === B_OUTCOME_LOST || outcome === B_OUTCOME_DREW;
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
      this.setBattledTrainerFlag();
      this.game.returnToFieldContinueScript(true);
      return;
    }
    if (lost) {
      this.game.whiteOut();
      return;
    }
    this.setBattledTrainerFlag();
    this.game.returnToFieldContinueScript(true);
  }

  createScriptedWildMon(species: number, level: number, item: number): void {
    const mon = createMon(species, level);
    if (item) mon.heldItem = item;
    this.scriptedWild = mon;
  }

  startScriptedWildBattle(): void {
    const enemy = this.scriptedWild ?? createMon(1, 5);
    this.game.startBattle({
      kind: "wild",
      enemyParty: [enemy],
      onEnd: (outcome) => {
        this.game.battleOutcome = outcome;
        if (outcome === B_OUTCOME_LOST || outcome === B_OUTCOME_DREW) this.game.whiteOut();
        else this.game.returnToFieldContinueScript(true);
      },
    });
  }

  startLegendaryBattle(): void {
    const ow = this.game.overworld;
    ow.script.stop();
    const enemy = this.scriptedWild ?? createMon(1, 5);
    this.game.startBattle({
      kind: "wild",
      isLegendary: true,
      enemyParty: [enemy],
      onEnd: (outcome) => {
        this.game.battleOutcome = outcome;
        if (outcome === B_OUTCOME_LOST || outcome === B_OUTCOME_DREW) this.game.whiteOut();
        else this.game.returnToFieldContinueScript(true);
      },
    });
  }

  startMarowakBattle(): void {
    const ow = this.game.overworld;
    ow.script.stop();
    const marowak = createMon(rom.c("SPECIES_MAROWAK"), 30);
    this.game.startBattle({
      kind: "wild",
      isGhost: true,
      enemyParty: [marowak],
      onEnd: (outcome) => {
        this.game.battleOutcome = outcome;
        if (outcome === B_OUTCOME_LOST || outcome === B_OUTCOME_DREW) this.game.whiteOut();
        else this.game.returnToFieldContinueScript(true);
      },
    });
  }

  startOldManTutorialBattle(): void {
    const ow = this.game.overworld;
    ow.script.stop();
    this.game.startBattle({
      kind: "wild",
      isOldMan: true,
      enemyParty: [createMon(rom.c("SPECIES_WEEDLE"), 5)],
      onEnd: () => this.game.returnToFieldContinueScript(true),
    });
  }
}
