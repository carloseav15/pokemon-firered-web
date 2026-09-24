// trade_scene.c in-game trades: sInGameTrades, GetInGameTradeSpeciesInfo,
// CreateInGameTradePokemon, TradeMons and the trade scene's messages and
// trade evolution (DoInGameTradeScene).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { stringVars } from "../gba/charmap";
import { cdata } from "../hw/assets";
import { rom } from "../rom";
import { save, SV, varGet } from "../save";
import { calculateStats, createMon, nickname, setDexFlag, speciesName, tradeEvolution, type Pokemon } from "./pokemon";
import { evolveWithMessages } from "../menus/monProgress";
import { openHardwareMessage } from "../menus/hardwareChoice";

type InGameTrade = {
  nickname: number[]; species: number; ivs: number[]; abilityNum: number; otId: number; conditions: number[]; personality: number;
  heldItem: number; mailNum: number; otName: number[]; otGender: number; sheen: number; requestedSpecies: number;
};

const trades = (): InGameTrade[] => cdata<InGameTrade[]>("trade_scene", "sInGameTrades");
let tradeMon: Pokemon | null = null;

/** GetInGameTradeSpeciesInfo */
export function getInGameTradeSpeciesInfo(): number {
  const t = trades()[varGet(SV.x8004)];
  stringVars.var1 = speciesName(t.requestedSpecies);
  stringVars.var2 = speciesName(t.species);
  return t.requestedSpecies;
}

/** GetTradeSpecies */
export function getTradeSpecies(): number {
  const mon = save.party[varGet(SV.x8005)];
  return !mon || mon.isEgg ? C.SPECIES_NONE : mon.species;
}

/** CreateInGameTradePokemonInternal */
export function createInGameTradePokemon(): void {
  const t = trades()[varGet(SV.x8004)];
  const level = save.party[varGet(SV.x8005)]?.level ?? 5;
  const mon = createMon(t.species, level, { personality: t.personality >>> 0, otId: t.otId >>> 0 });
  mon.ivs = [...t.ivs];
  mon.nickname = [...t.nickname];
  mon.otName = [...t.otName];
  mon.otGender = t.otGender;
  mon.abilityNum = t.abilityNum;
  mon.metLocation = C.METLOC_IN_GAME_TRADE;
  if (t.heldItem) mon.heldItem = t.heldItem;
  (mon as Pokemon & { contest?: number[] }).contest = [t.conditions[0], t.conditions[1], t.conditions[2], t.conditions[3], t.conditions[4], t.sheen];
  calculateStats(mon);
  mon.hp = mon.stats[0];
  tradeMon = mon;
}

/** The trade scene's text sequence, TradeMons and the trade evolution check. */
export function doInGameTradeScene(done: () => void): void {
  const index = varGet(SV.x8005);
  const sent = save.party[index];
  const received = tradeMon;
  if (!sent || !received) { done(); return; }
  stringVars.var1 = Uint8Array.from(received.otName);
  stringVars.var2 = nickname(sent);
  stringVars.var3 = nickname(received);
  openHardwareMessage(rom.text("gText_XWillBeSentToY"), () => {
    if (!sent.isEgg) sound.playCry(sent.species, 0);
    openHardwareMessage(rom.text("gText_ByeByeVar1"), () => {
      openHardwareMessage(rom.text("gText_XSentOverY"), () => {
        if (!received.isEgg) sound.playCry(received.species, 0);
        sound.playFanfare(C.MUS_EVOLVED);
        openHardwareMessage(rom.text("gText_TakeGoodCareOfX"), () => {
          // TradeMons: received mons start at 70 friendship and are registered in the Pokédex.
          save.party[index] = received;
          if (!received.isEgg) received.friendship = 70;
          setDexFlag(received.species, true);
          tradeMon = null;
          const target = received.isEgg ? 0 : tradeEvolution(received);
          if (target && received.heldItem !== C.ITEM_EVERSTONE) evolveWithMessages(received, target, done);
          else done();
        });
      });
    });
  });
}
