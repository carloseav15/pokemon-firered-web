// Port of battle_setup.c: trainerbattle argument parsing, trainer flags,
// wild/scripted battle starts and the end-of-battle callbacks.

import { sound } from "../audio/sound";
import { expandPlaceholders } from "../gba/charmap";
import { rom } from "../rom";
import { tasks } from "../gba/tasks";
import { paletteFade } from "../gba/fade";
import { clearRematchStateOfLastTalked, getRematchTrainerId } from "../field/vsSeeker";
import { afterRoamerBattle } from "../pokemon/roamer";
import { gEnemyParty } from "../pokemon/mon";
import { checkBagHasItem } from "../pokemon/items";
import { incrementGameStat } from "../save";
import { flagClear, flagGet, flagSet, save, SV, varSet } from "../save";
import { createMaleMon, createMon, genderFromPersonality, healMon, MON_FEMALE, type Pokemon } from "../pokemon/pokemon";
import { random32 } from "../random";
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
      const objects = this.game.overworld.objects;
      const o = objects.byLocalIdAndMap(this.localId, save.location.mapNum, save.location.mapGroup);
      // Source lookup returns OBJECT_EVENTS_COUNT when the trainer is absent.
      this.game.overworld.selectedObject = o ? objects.indexOf(o) : objects.objects.length;
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
        this.opponentA = getRematchTrainerId(this.opponentA);
        return rom.label("EventScript_TryDoDoubleRematchBattle");
      case TRAINER_BATTLE_REMATCH:
        this.load(ORDINARY, ptr);
        this.setMapVarsToTrainer();
        this.opponentA = getRematchTrainerId(this.opponentA);
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

  startTrainerBattle(rematch = false): void {
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
      onEnd: (outcome) => this.endTrainerBattle(outcome, rematch),
    });
  }

  private endTrainerBattle(outcome: number, rematch = false): void {
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
    if (rematch) clearRematchStateOfLastTalked(); // CB2_EndRematchBattle
    this.game.returnToFieldContinueScript(true);
  }

  createScriptedWildMon(species: number, level: number, item: number): void {
    const mon = createMon(species, level);
    if (item) mon.heldItem = item;
    this.scriptedWild = mon;
  }

  /** battle_setup.c StartWildBattle: Safari, unidentified tower ghost, or ordinary wild. */
  startWildBattle(enemy: Pokemon): void {
    const map = (save.location.mapGroup << 8) | save.location.mapNum;
    const c = rom.constants;
    // CheckSilphScopeInPokemonTower includes every floor from 1F through 7F.
    const tower = [1, 2, 3, 4, 5, 6, 7].some(floor => map === c[`MAP_POKEMON_TOWER_${floor}F`]);
    const safari = flagGet(c.FLAG_SYS_SAFARI_MODE);
    incrementGameStat(c.GAME_STAT_TOTAL_BATTLES);
    incrementGameStat(c.GAME_STAT_WILD_BATTLES);
    this.game.startBattle({
      kind: "wild", enemyParty: [enemy], isSafari: safari,
      isGhost: !safari && tower && !checkBagHasItem(c.ITEM_SILPH_SCOPE, 1),
      onEnd: outcome => {
        this.game.battleOutcome = outcome;
        if (safari) { this.endSafariBattle(outcome); return; }
        if (outcome === B_OUTCOME_LOST || outcome === B_OUTCOME_DREW) this.game.whiteOut();
        else this.game.returnToFieldContinueScript(true);
      },
    });
  }

  /** safari_zone.c CB2_EndSafariBattle */
  private endSafariBattle(outcome: number): void {
    const game = this.game, ow = game.overworld;
    if (game.safariBalls !== 0) { game.returnToFieldContinueScript(true); return; }
    if (outcome === rom.c("B_OUTCOME_NO_SAFARI_BALLS")) {
      game.scene = null;
      ow.script.runImmediately(rom.label("SafariZone_EventScript_OutOfBallsMidBattle"));
      ow.fieldCallback = () => {
        ow.controlsLocked = true;
        ow.playSpecialMapMusic();
        ow.fadeInFromBlack();
        const id = tasks.create(() => {
          if (paletteFade.active) return;
          tasks.destroy(id);
          ow.objects.clearHeldMovementIfFinished(ow.player.object);
          ow.objects.unfreezeAll();
          ow.controlsLocked = false;
        }, 10);
      };
      ow.warpIntoMapAndLoad();
      return;
    }
    // B_OUTCOME_CAUGHT with the last ball
    ow.script.setupScript(rom.label("SafariZone_EventScript_OutOfBalls"));
    ow.script.stop();
    game.returnToFieldContinueScript(true);
  }

  /** battle_setup.c StartRoamerBattle (BATTLE_TYPE_ROAMER), with UpdateRoamerHPStatus afterwards. */
  startRoamerBattle(enemy: Pokemon): void {
    incrementGameStat(rom.c("GAME_STAT_TOTAL_BATTLES"));
    incrementGameStat(rom.c("GAME_STAT_WILD_BATTLES"));
    this.game.startBattle({
      kind: "wild", enemyParty: [enemy], isRoamer: true,
      onEnd: (outcome) => {
        afterRoamerBattle(gEnemyParty[0] as unknown as Pokemon, outcome);
        this.game.battleOutcome = outcome;
        if (outcome === B_OUTCOME_LOST || outcome === B_OUTCOME_DREW) this.game.whiteOut();
        else this.game.returnToFieldContinueScript(true);
      },
    });
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
    this.startLegendaryWild({ isLegendaryFrlg: true });
  }

  startSouthernIslandBattle(): void {
    this.startLegendaryWild({});
  }

  startRegiBattle(): void {
    this.startLegendaryWild({ isRegi: true });
  }

  startGroudonKyogreBattle(): void {
    this.startLegendaryWild({ isKyogreGroudon: true });
  }

  private startLegendaryWild(flags: Pick<BattleRequest, "isRegi" | "isKyogreGroudon" | "isLegendaryFrlg">): void {
    const ow = this.game.overworld;
    ow.script.stop();
    const enemy = this.scriptedWild ?? createMon(1, 5);
    this.game.startBattle({
      kind: "wild",
      isLegendary: true,
      ...flags,
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
      enemyParty: [createMaleMon(rom.c("SPECIES_WEEDLE"), 5)],
      onEnd: () => this.game.returnToFieldContinueScript(true),
    });
  }
}
