// Move learning and evolution flows shared by the bag, TM case, move tutors
// and level-up items: party_menu.c (Task_TryLearnNewMoves, DisplayMonNeedsToReplaceMove,
// Task_ReplaceMoveYesNo, ItemUseCB_TM*), pokemon.c (MonTryLearningNewMove) and
// the evolution_scene.c result messages (EvolutionScene is ported separately).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { decode, stringVars } from "../gba/charmap";
import { rom } from "../rom";
import { save } from "../save";
import { evolveMon, giveMove, MON_ALREADY_KNOWS_MOVE, MON_HAS_MAX_MOVES, movesLearnedAtLevel, setDexFlag, createMon, speciesName, type Pokemon } from "../pokemon/pokemon";
import { openHardwareChoice, openHardwareMessage } from "./hardwareChoice";
import { BeginEvolutionScene } from "../evolutionScene";

/** ItemIdToBattleMoveId: the move taught by a TM/HM item. */
export function tmhmMove(item: number): number {
  const index = item - C.ITEM_TM01;
  return sTMHMMoves()[index] ?? 0;
}

let tmhmCache: number[] | undefined;
function sTMHMMoves(): number[] {
  if (tmhmCache) return tmhmCache;
  // sTMHMMoves (party_menu.c): the item descriptions' move order.
  const names = ["FOCUS_PUNCH", "DRAGON_CLAW", "WATER_PULSE", "CALM_MIND", "ROAR", "TOXIC", "HAIL", "BULK_UP", "BULLET_SEED", "HIDDEN_POWER",
    "SUNNY_DAY", "TAUNT", "ICE_BEAM", "BLIZZARD", "HYPER_BEAM", "LIGHT_SCREEN", "PROTECT", "RAIN_DANCE", "GIGA_DRAIN", "SAFEGUARD",
    "FRUSTRATION", "SOLAR_BEAM", "IRON_TAIL", "THUNDERBOLT", "THUNDER", "EARTHQUAKE", "RETURN", "DIG", "PSYCHIC", "SHADOW_BALL",
    "BRICK_BREAK", "DOUBLE_TEAM", "REFLECT", "SHOCK_WAVE", "FLAMETHROWER", "SLUDGE_BOMB", "SANDSTORM", "FIRE_BLAST", "ROCK_TOMB", "AERIAL_ACE",
    "TORMENT", "FACADE", "SECRET_POWER", "REST", "ATTRACT", "THIEF", "STEEL_WING", "SKILL_SWAP", "SNATCH", "OVERHEAT",
    "CUT", "FLY", "SURF", "STRENGTH", "FLASH", "ROCK_SMASH", "WATERFALL", "DIVE"];
  tmhmCache = names.map((n) => rom.c(`MOVE_${n}`));
  return tmhmCache;
}

export function isHMMove(move: number): boolean {
  const moves = sTMHMMoves();
  return moves.indexOf(move) >= 50;
}

function setVars(mon: Pokemon, move: number): void {
  stringVars.var1 = Uint8Array.from(mon.nickname);
  stringVars.var2 = rom.moveName(move);
}

/**
 * Try to learn `move`: learned directly with a free slot, or ask to replace
 * one (HM moves can't be forgotten). `done(true)` when the move was learned.
 */
export function learnMoveWithPrompt(mon: Pokemon, move: number, done: (learned: boolean) => void): void {
  setVars(mon, move);
  const result = giveMove(mon, move);
  if (result === MON_ALREADY_KNOWS_MOVE) {
    openHardwareMessage(rom.text("gText_PkmnAlreadyKnows"), () => done(false));
    return;
  }
  if (result !== MON_HAS_MAX_MOVES) {
    sound.playFanfare(C.MUS_LEVEL_UP);
    openHardwareMessage(rom.text("gText_PkmnLearnedMove3"), () => done(true));
    return;
  }
  const askReplace = (): void => {
    setVars(mon, move);
    openHardwareMessage(rom.text("gText_PkmnNeedsToReplaceMove"), () => {
      openHardwareChoice("", [{ label: "YES", value: 1 }, { label: "NO", value: 0 }], true, (yes) => {
        if (yes === 1) chooseMove(); else stopLearning();
      });
    });
  };
  const chooseMove = (): void => {
    openHardwareChoice(rom.text("gText_WhichMoveToForget"), [
      ...mon.moves.map((m, slot) => ({ label: m ? `${decode(rom.moveName(m))}  PP ${mon.pp[slot]}` : "-", value: slot, disabled: !m })),
      { label: decode(rom.moveName(move)), value: 4 },
    ], true, (slot) => {
      if (slot === null || slot === 4) { stopLearning(); return; }
      const old = mon.moves[slot];
      if (isHMMove(old)) {
        openHardwareMessage(rom.text("gText_PokeSum_HmMovesCantBeForgotten"), chooseMove);
        return;
      }
      stringVars.var1 = Uint8Array.from(mon.nickname);
      stringVars.var2 = rom.moveName(old);
      openHardwareMessage(rom.text("gText_12PoofForgotMove"), () => {
        mon.moves[slot] = move;
        mon.pp[slot] = rom.moves[move].pp;
        mon.ppBonuses &= ~(3 << (slot * 2));
        setVars(mon, move);
        sound.playFanfare(C.MUS_LEVEL_UP);
        openHardwareMessage(rom.text("gText_PkmnLearnedMove3"), () => done(true));
      });
    });
  };
  const stopLearning = (): void => {
    setVars(mon, move);
    openHardwareMessage(rom.text("gText_StopLearningMove2"), () => {
      openHardwareChoice("", [{ label: "YES", value: 1 }, { label: "NO", value: 0 }], true, (yes) => {
        if (yes === 1) {
          setVars(mon, move);
          openHardwareMessage(rom.text("gText_MoveNotLearned"), () => done(false));
        } else askReplace();
      });
    });
  };
  askReplace();
}

/** MonTryLearningNewMove loop at the mon's current level. */
export function learnLevelUpMoves(mon: Pokemon, done: () => void): void {
  const moves = movesLearnedAtLevel(mon.species, mon.level);
  const next = (i: number): void => {
    if (i >= moves.length) { done(); return; }
    if (mon.moves.includes(moves[i])) { next(i + 1); return; }
    learnMoveWithPrompt(mon, moves[i], () => next(i + 1));
  };
  next(0);
}

/**
 * Evolution: runs the faithful GBA BeginEvolutionScene.
 */
export function evolveWithMessages(mon: Pokemon, target: number, done: () => void): void {
  const slot = Math.max(0, save.party.indexOf(mon));
  BeginEvolutionScene(mon, target, false, slot, done);
}

/** evolution_scene.c CreateShedinja */
export function trySpawnShedinja(mon: Pokemon, preEvo: number): void {
  const evo = rom.species[preEvo]?.evolutions.find(([method]) => method === C.EVO_LEVEL_SHEDINJA);
  if (!evo || save.party.length >= 6) return;
  const ball = save.bag.pokeBalls.find((s) => s.item === C.ITEM_POKE_BALL && s.quantity > 0);
  if (!ball) return;
  const shedinja: Pokemon = { ...structuredClone(mon), species: evo[2] };
  shedinja.nickname = Array.from(speciesName(evo[2]));
  shedinja.heldItem = 0;
  shedinja.markings = 0;
  shedinja.status = 0;
  shedinja.mail = undefined;
  const fresh = createMon(evo[2], mon.level, { personality: mon.personality, otId: mon.otId });
  shedinja.stats = fresh.stats;
  shedinja.hp = fresh.stats[0];
  save.party.push(shedinja);
  setDexFlag(evo[2], true);
  ball.quantity--;
  if (!ball.quantity) save.bag.pokeBalls.splice(save.bag.pokeBalls.indexOf(ball), 1);
}
