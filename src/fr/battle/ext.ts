// Functions the battle engine calls in other game systems: party_menu.c (battle party order, level-up
// window), pokemon.c (PokemonUseItemEffects, GetEvolutionTargetSpecies, ...), overworld/field helpers,
// battle_setup.c accessors, money and game stats.
//
// Bag/party/move selection now use hardware-window adapters and naming has its
// own hardware screen. Dedicated source menu presentation, tutorial choreography,
// Pokédex and evolution screens still require port work.

import * as C from "../generated/constants";
import { DoNamingScreen as OpenNamingScreen } from "../namingScreen";
import { openHardwareChoice } from "../menus/hardwareChoice";
import { decode, stringVars } from "../gba/charmap";
import { b64 } from "../rom";
import type { NameBuffer } from "../menus/namingModel";
import { sound } from "../audio/sound";
import { clearRematchStateByTrainerId } from "../field/vsSeeker";
import { EOS, encode, intToDecimal, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { cdata, incbin } from "../hw/assets";
import { gMain } from "../hw/runtime";
import { AddTextPrinterParameterized3 } from "../hw/text";
import { FillWindowPixelBuffer, PIXEL_FILL } from "../hw/window";
import { itemInfo, itemName, pocketList, removeBagItem, addBagItem, addMoney } from "../pokemon/items";
import { giveMonToPlayer, itemEvolution, levelUpEvolution, type Pokemon } from "../pokemon/pokemon";
import {
  CalculateMonStats, CalculatePPWithBonus, currentRegionMapSection, GetMonData, GetMonEVCount, gEnemyParty, playerMon, SetMonData, type Mon,
} from "../pokemon/mon";
import { GetSetPokedexFlag } from "../pokemon/mon_extra";
import { symPalette } from "../pokemon/pics";
import { rom } from "../rom";
import { flagGet, flagSet, incrementGameStat, save, varGet, varSet } from "../save";
import { BattlePokemon } from "../generated/structs";
import {
  G, gBattleMons, gBattlePartyCurrentOrder, gBattlerPartyIndexes, gBattleResults, gBattleScripting, gBattleStruct, gBitTable, gSideTimers,
} from "./globals";
import { MOVE_IS_PERMANENT } from "./macros";
import { CopyMonData } from "./mon_transfer";
import { BtlController_EmitGetMonData, BUFFER_A } from "./controllers";
import { GetAbilityBySpecies, GetBattlerAtPosition, GetBattlerSide, ItemId_GetHoldEffect, MarkBattlerForControllerExec } from "./util";
import { battleHost } from "./host";
import { ReshowBattleScreenAfterMenu } from "./reshow";
import * as PartyMenu from "../partyMenu";
import { bagResult, BackUpPlayerBag, CB2_SetUpReshowBattleScreenAfterMenu, GoToBagMenu, RestorePlayerBag, type BagTaskContext } from "../bagMenu";
import { InitBerryPouch } from "../berryPouch";
import { gDisableStructs } from "./globals";
import { GetMonLevelUpWindowStats } from "../pokemonSpecialAnim";

export { GetMonLevelUpWindowStats } from "../pokemonSpecialAnim";

export { GetSetPokedexFlag };

const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);
const IsMultiBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI);

// ---------------------------------------------------------------- money / stats / battle_setup

export function AddMoney(amount: number): void {
  addMoney(amount);
}

export function IncrementGameStat(index: number): void {
  incrementGameStat(index);
}

// Shared with field whiteout: both paths use the same source calculation.
export { computeWhiteOutMoneyLoss as ComputeWhiteOutMoneyLoss } from "../pokemon/partyRules";

export function GetTrainerBattleMode(): number {
  return battleHost.trainerBattleMode();
}

export function GetRivalBattleFlags(): number {
  return battleHost.rivalBattleFlags();
}

/** vs_seeker.c ClearRematchStateByTrainerId */
export function ClearRematchStateByTrainerId(): void {
  clearRematchStateByTrainerId(battleHost.game(), battleHost.opponentA());
}

export function GetCurrentMapType(): number {
  return battleHost.mapType();
}

export function GetCurrentWeather(): number {
  return battleHost.weather();
}

export function FadeOutMapMusic(speed: number): void {
  sound.fadeOutBGM(speed);
}

export function IsFanfareTaskInactive(): boolean {
  return sound.isFanfareTaskInactive();
}

// ---------------------------------------------------------------- party_menu.c: battle party order

function BufferBattlePartyOrder(partyBattleOrder: Uint8Array | number[], flankId: number): void {
  if (IsMultiBattle()) {
    const order = flankId ? [0 | (3 << 4), 5 | (4 << 4), 2 | (1 << 4)] : [3 | (0 << 4), 2 | (1 << 4), 5 | (4 << 4)];
    for (let i = 0; i < 3; i++) partyBattleOrder[i] = order[i];
    return;
  }
  const partyIds: number[] = [];
  if (!IsDoubleBattle()) {
    partyIds[0] = gBattlerPartyIndexes[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)];
    for (let i = 0; i < C.PARTY_SIZE; i++) if (i !== partyIds[0]) partyIds.push(i);
  } else {
    partyIds[0] = gBattlerPartyIndexes[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)];
    partyIds[1] = gBattlerPartyIndexes[GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT)];
    for (let i = 0; i < C.PARTY_SIZE; i++) if (i !== partyIds[0] && i !== partyIds[1]) partyIds.push(i);
  }
  for (let i = 0; i < 3; i++) partyBattleOrder[i] = ((partyIds[i * 2] << 4) | partyIds[i * 2 + 1]) & 0xff;
}

/** pokemon.c GetPlayerFlankId: 0 outside link battles. */
const GetPlayerFlankId = () => 0;

export function BufferBattlePartyCurrentOrder(): void {
  BufferBattlePartyOrder(gBattlePartyCurrentOrder, GetPlayerFlankId());
}

export function BufferBattlePartyCurrentOrderBySide(battlerId: number, flankId: number): void {
  const orders = gBattleStruct.battlerPartyOrders.subarray(battlerId * 3, battlerId * 3 + 3);
  if (IsMultiBattle()) {
    BufferBattlePartyOrder(orders, flankId);
    return;
  }
  const player = GetBattlerSide(battlerId) === C.B_SIDE_PLAYER;
  const left = GetBattlerAtPosition(player ? C.B_POSITION_PLAYER_LEFT : C.B_POSITION_OPPONENT_LEFT);
  const right = GetBattlerAtPosition(player ? C.B_POSITION_PLAYER_RIGHT : C.B_POSITION_OPPONENT_RIGHT);
  const ids: number[] = [gBattlerPartyIndexes[left]];
  if (IsDoubleBattle()) ids.push(gBattlerPartyIndexes[right]);
  for (let i = 0; i < C.PARTY_SIZE; i++) if (!ids.slice(0, IsDoubleBattle() ? 2 : 1).includes(i)) ids.push(i);
  for (let i = 0; i < 3; i++) orders[i] = ((ids[i * 2] << 4) | ids[i * 2 + 1]) & 0xff;
}

export function GetPartyIdFromBattlePartyId(battlePartyId: number): number {
  for (let i = 0, j = 0; i < gBattlePartyCurrentOrder.length; j++, i++) {
    if (gBattlePartyCurrentOrder[i] >> 4 !== battlePartyId) {
      j++;
      if ((gBattlePartyCurrentOrder[i] & 0xf) === battlePartyId) return j;
    } else {
      return j;
    }
  }
  return 0;
}

function GetPartyIdFromBattleSlot(slot: number): number {
  const b = gBattlePartyCurrentOrder[slot >> 1];
  return slot & 1 ? b & 0xf : b >> 4;
}

function SetPartyIdAtBattleSlot(slot: number, value: number): void {
  const i = slot >> 1;
  if (slot & 1) gBattlePartyCurrentOrder[i] = (gBattlePartyCurrentOrder[i] & 0xf0) | value;
  else gBattlePartyCurrentOrder[i] = (gBattlePartyCurrentOrder[i] & 0xf) | (value << 4);
}

export function SwitchPartyMonSlots(slot: number, slot2: number): void {
  const partyId = GetPartyIdFromBattleSlot(slot);
  SetPartyIdAtBattleSlot(slot, GetPartyIdFromBattleSlot(slot2));
  SetPartyIdAtBattleSlot(slot2, partyId);
}

// ---------------------------------------------------------------- party menu / bag / summary (screens pending)

/** gPartyMenuUseExitCallback / gSelectedMonPartyId */
export const partyMenuResult = { useExitCallback: false, selectedMonPartyId: C.PARTY_SIZE };

/** party_menu.c OpenPartyMenuInTutorialBattle → SetCB2ToReshowScreenAfterMenu */
export function OpenPartyMenuInTutorialBattle(partyAction: number): void {
  PartyMenu.OpenPartyMenuInTutorialBattle(partyAction, () => { CB2_SetUpReshowBattleScreenAfterMenu(); ReshowBattleScreenAfterMenu(); });
}

/** item_use.c battle handlers. Selection and effects finish before returning to battle. */
export function CB2_BagMenuFromBattle(): void {
  varSet(C.VAR_ITEM_ID, C.ITEM_NONE);
  const menuBattler = G.gBattlerInMenuId;
  const finish = (item: number): void => { varSet(C.VAR_ITEM_ID, item); CB2_SetUpReshowBattleScreenAfterMenu(); ReshowBattleScreenAfterMenu(); };
  const message = (label: string): void => openHardwareChoice(label, [{label: "OK", value: 0}], false, () => showBag());
  const apply = (item: number, partyIndex: number, moveIndex: number): void => {
    G.gBattlerInMenuId = menuBattler;
    const mon = playerMon(partyIndex);
    if (PokemonUseItemEffects(mon, item, partyIndex, moveIndex, false)) { message("It won't have any effect."); return; }
    removeBagItem(item, 1);
    sound.playSE(C.SE_USE_ITEM);
    finish(item);
  };
  /** gItemUseCB = cb; EnterPartyFromItemMenuInBattle (CB2_SetUpExitToBattleScreen or back to the bag). */
  const chooseMon = (item: number, cb: typeof PartyMenu.ItemUseCB_Medicine, back: () => void): void => {
    bagResult.itemId = item;
    PartyMenu.SetItemUseCB(cb);
    PartyMenu.EnterPartyFromItemMenuInBattle(() => { G.gBattlerInMenuId = menuBattler; finish(item); }, back);
  };
  /** CB2_BagMenuFromBattle: GoToBagMenu(ITEMMENULOCATION_BATTLE, OPEN_BAG_LAST, SetCB2ToReshowScreenAfterMenu2). */
  // ItemId_GetBattleFunc(item)(taskId), shared by the bag and the berry pouch.
  const battleUse = (item: number, ctx: BagTaskContext): void => {
    const info = itemInfo(item)!;
    const notNow = (): void => { stringVars.var1 = Uint8Array.from(save.playerName); ctx.message(rom.text("gText_OakForbidsUseOfItemHere")); };
    const back = info.pocket === C.POCKET_BERRY_POUCH ? () => InitBerryPouch(C.BERRYPOUCH_NA, null, 0xff, { battleUse }) : showBag;
    switch (info.battleUseFunc) {
      case "BattleUseFunc_PokeBallEtc":
        if (save.party.length >= C.PARTY_SIZE && save.boxes.every(box => box.every(mon => !!mon?.species))) { ctx.message(rom.text("gText_BoxFull")); return; }
        removeBagItem(item, 1);
        ctx.exit(() => finish(item));
        return;
      case "BattleUseFunc_PokeFlute": ctx.exit(() => finish(item)); return;
      case "BattleUseFunc_PokeDoll":
        if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) { notNow(); return; }
        removeBagItem(item, 1);
        ctx.exit(() => finish(item));
        return;
      case "BattleUseFunc_StatBooster": ctx.exit(() => apply(item, gBattlerPartyIndexes[menuBattler], 0)); return;
      case "BattleUseFunc_Medicine": ctx.exit(() => chooseMon(item, PartyMenu.ItemUseCB_Medicine, back)); return;
      case "BattleUseFunc_Ether": ctx.exit(() => chooseMon(item, PartyMenu.ItemUseCB_TryRestorePP, back)); return;
      // BattleUseFunc_BerryPouch: InitBerryPouch(BERRYPOUCH_FROMBATTLE, CB2_BagMenuFromBattle, FALSE)
      case "BattleUseFunc_BerryPouch": ctx.exit(() => InitBerryPouch(C.BERRYPOUCH_FROMBATTLE, showBag, 0, { battleUse })); return;
      default: notNow(); return;
    }
  };
  const showBag = (): void => GoToBagMenu(C.ITEMMENULOCATION_BATTLE, C.OPEN_BAG_LAST, () => finish(bagResult.itemId), { battleUse });
  showBag();
}

/** item_menu.c InitOldManBag: backs up the bag and gives a Potion and a Poké Ball for the tutorial. */
export function InitOldManBag(): void {
  // BackUpPlayerBag clears the three GBA bag pockets so a full player bag
  // cannot prevent the tutorial's Potion and Poké Ball from being added.
  const bagBackup = BackUpPlayerBag();
  addBagItem(C.ITEM_POTION, 1);
  addBagItem(C.ITEM_POKE_BALL, 1);
  GoToBagMenu(C.ITEMMENULOCATION_OLD_MAN, C.OPEN_BAG_ITEMS, () => {
    // InitOldManBag/RestorePlayerBag: tutorial items are temporary, not save inventory.
    RestorePlayerBag(bagBackup);
    varSet(C.VAR_ITEM_ID, bagResult.itemId);
    CB2_SetUpReshowBattleScreenAfterMenu();
    ReshowBattleScreenAfterMenu();
  });
}

export { ShowSelectMovePokemonSummaryScreen, GetMoveSlotToReplace } from "../pokemonSummaryScreen";

/** Naming owns the hardware until it returns; reconstruct battle VRAM before resuming. */
export function DoNamingScreen(type: number, dest: NameBuffer, species: number, gender: number, personality: number, returnCallback: () => void): void {
  OpenNamingScreen(type, dest, species, gender, personality, () => {
    ReshowBattleScreenAfterMenu(returnCallback);
  });
}

export { DexScreen_RegisterMonToPokedex } from "../pokedexScreen";
export { CreateMonPicSprite_HandleDeoxys } from "../trainerPokemonSprites";

/** evolution_scene.c EvolutionScene (presentation in ./evoScene). */
import { EvolutionScene } from "./evoScene";
export { EvolutionScene };

// ---------------------------------------------------------------- pokemon.c

export function GetEvolutionTargetSpecies(mon: Mon, mode: number, evolutionItem: number): number {
  const heldItem = GetMonData(mon, C.MON_DATA_HELD_ITEM);
  if (ItemId_GetHoldEffect(heldItem) === C.HOLD_EFFECT_PREVENT_EVOLVE && mode !== C.EVO_MODE_TRADE) return C.SPECIES_NONE;
  if (mode === C.EVO_MODE_NORMAL) return levelUpEvolution(mon as Pokemon);
  if (mode === C.EVO_MODE_ITEM_USE || mode === C.EVO_MODE_ITEM_CHECK) return itemEvolution(mon as Pokemon, evolutionItem);
  return C.SPECIES_NONE;
}

export function GiveMonToPlayer(mon: Mon): number {
  return giveMonToPlayer(mon as Pokemon);
}

export function IsPlayerPartyAndPokemonStorageFull(): boolean {
  if (save.party.length < C.PARTY_SIZE) return false;
  return save.boxes.every((box) => box.every((slot) => slot !== null));
}

/** pokedex.c GetPokedexHeightWeight(dexNum, 0 = height, 1 = weight) */
export function GetPokedexHeightWeight(dexNum: number, data: number): number {
  const entry = cdata<Array<{ height: number; weight: number }>>("pokedex_screen", "gPokedexEntries")[dexNum];
  if (!entry) return 1;
  return data === 0 ? entry.height : entry.weight;
}

export {
  shouldShowBoxWasFullMessage as ShouldShowBoxWasFullMessage,
  getPCBoxToSendMon as GetPCBoxToSendMon,
  getBoxName as GetBoxNamePtr,
} from "../pokemon/storage";

// ---------------------------------------------------------------- pokemon_icon.c

export { GetMonIconPtr, GetValidMonIconPalettePtr } from "../pokemonIcon";

// ---------------------------------------------------------------- level-up window (pokemon_special_anim*.c)

const statNames = () => cdata<unknown[]>("pokemon_special_anim_scene", "sLevelUpWindowStatNames").map((r) => strFrom(r));
function strFrom(ref: unknown): number[] {
  const name = (ref as { $sym: string }).$sym;
  return cdata<number[]>("strings", name);
}

export function DrawLevelUpWindowPg1(windowId: number, beforeStats: ArrayLike<number>, afterStats: ArrayLike<number>, bgColor: number, fgColor: number, shadowColor: number): void {
  FillWindowPixelBuffer(windowId, PIXEL_FILL(bgColor));
  const s16 = (v: number) => (v << 16) >> 16;
  const diff = [0, 1, 2, 4, 5, 3].map((k) => s16(afterStats[k] - beforeStats[k]));
  const color = [bgColor, fgColor, shadowColor];
  const names = statNames();
  for (let i = 0; i < 6; i++) {
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 0, i * 15, color, C.TEXT_SKIP_DRAW, names[i]);
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 56, i * 15, color, C.TEXT_SKIP_DRAW, strFrom({ $sym: diff[i] >= 0 ? "gText_LevelUp_Plus" : "gText_LevelUp_Minus" }));
    const x = Math.abs(diff[i]) < 10 ? 12 : 6;
    const num = intToDecimal(Math.abs(diff[i]), STR_CONV_MODE_LEFT_ALIGN, 2);
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, x + 56, i * 15, color, C.TEXT_SKIP_DRAW, [C.CHAR_SPACE, ...num]);
  }
}

export function DrawLevelUpWindowPg2(windowId: number, currStats: ArrayLike<number>, bgColor: number, fgColor: number, shadowColor: number): void {
  FillWindowPixelBuffer(windowId, PIXEL_FILL(bgColor));
  const stats = [0, 1, 2, 4, 5, 3].map((k) => currStats[k]);
  const color = [bgColor, fgColor, shadowColor];
  const names = statNames();
  for (let i = 0; i < 6; i++) {
    const ndigits = stats[i] >= 100 ? 3 : stats[i] >= 10 ? 2 : 1;
    const num = intToDecimal(stats[i], STR_CONV_MODE_LEFT_ALIGN, ndigits);
    const x = 6 * (4 - ndigits);
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 0, i * 15, color, C.TEXT_SKIP_DRAW, names[i]);
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 56 + x, i * 15, color, C.TEXT_SKIP_DRAW, num);
  }
}

// ---------------------------------------------------------------- pokemon.c PokemonUseItemEffects

const sGetMonDataEVConstants = [C.MON_DATA_HP_EV, C.MON_DATA_ATK_EV, C.MON_DATA_DEF_EV, C.MON_DATA_SPEED_EV, C.MON_DATA_SPDEF_EV, C.MON_DATA_SPATK_EV];
const gPPUpGetMask = [0x03, 0x0c, 0x30, 0xc0];
const gPPUpClearMask = [0xfc, 0xf3, 0xcf, 0x3f];
const gPPUpAddValues = [0x01, 0x04, 0x10, 0x40];
const MAX_STAT_STAGE = 12;

function HealStatusConditions(mon: Mon, healMask: number, battleId: number): number {
  let status = GetMonData(mon, C.MON_DATA_STATUS);
  if (status & healMask) {
    status &= ~healMask;
    SetMonData(mon, C.MON_DATA_STATUS, status >>> 0);
    if (gMain.inBattle && battleId !== 4) gBattleMons[battleId].status1 &= ~healMask;
    return 0;
  }
  return 1;
}

function CopyPlayerPartyMonToBattleData(battlerId: number, partyIndex: number): void {
  const buf = new Uint8Array(BattlePokemon.SIZE);
  CopyMonData(playerMon(partyIndex), C.REQUEST_ALL_BATTLE, buf, 0);
  const bm = gBattleMons[battlerId];
  bm.bytes.set(buf);
  const species = bm.species;
  bm.type1 = rom.species[species].types[0];
  bm.type2 = rom.species[species].types[1];
  bm.ability = GetAbilityBySpecies(species, bm.abilityNum);
  gBattleStruct.hpOnSwitchout[GetBattlerSide(battlerId)] = bm.hp;
}

/** Returns FALSE (0) when the item had an effect, TRUE when it did nothing (as in the original). */
export function PokemonUseItemEffects(mon: Mon, item: number, partyIndex: number, moveIndex: number, usedByAI: boolean): boolean {
  let retVal = true;
  let idx = C.ITEM_EFFECT_ARG_START;
  let friendshipChange = 0;
  let battleMonId = 4;
  const holdEffect = ItemId_GetHoldEffect(GetMonData(mon, C.MON_DATA_HELD_ITEM));

  G.gPotentialItemEffectBattler = G.gBattlerInMenuId;
  if (gMain.inBattle) {
    G.gActiveBattler = G.gBattlerInMenuId;
    for (let i = GetBattlerSide(G.gActiveBattler) !== C.B_SIDE_PLAYER ? 1 : 0; i < G.gBattlersCount; i += 2) {
      if (gBattlerPartyIndexes[i] === partyIndex) {
        battleMonId = i;
        break;
      }
    }
  } else {
    G.gActiveBattler = 0;
    battleMonId = 4;
  }

  if (!(item >= C.ITEM_POTION && item <= C.MAX_BERRY_INDEX)) return true;
  const itemEffect = rom.itemEffects[item - C.ITEM_POTION];
  if (!itemEffect) return true; // the Enigma Berry's e-Reader effect is not supported

  const a = G.gActiveBattler;
  const active = gBattleMons[a];
  const raise = (stat: number, amount: number) => {
    active.statStages[stat] = Math.min(MAX_STAT_STAGE, active.statStages[stat] + amount);
    retVal = false;
  };

  const updateFriendship = () => {
    if (retVal === false || friendshipChange !== 0) return;
    friendshipChange = (itemEffect[idx] << 24) >> 24;
    let friendship = GetMonData(mon, C.MON_DATA_FRIENDSHIP);
    if (friendshipChange > 0 && holdEffect === C.HOLD_EFFECT_FRIENDSHIP_UP) friendship += Math.trunc((150 * friendshipChange) / 100);
    else friendship += friendshipChange;
    if (friendshipChange > 0) {
      if (GetMonData(mon, C.MON_DATA_POKEBALL) === C.ITEM_LUXURY_BALL) friendship++;
      if (GetMonData(mon, C.MON_DATA_MET_LOCATION) === currentRegionMapSection()) friendship++;
    }
    friendship = Math.max(0, Math.min(C.MAX_FRIENDSHIP, friendship));
    SetMonData(mon, C.MON_DATA_FRIENDSHIP, friendship);
  };

  const raiseEV = (field: number): boolean => {
    const evCount = GetMonEVCount(mon);
    if (evCount >= C.MAX_TOTAL_EVS) return true;
    let data = GetMonData(mon, field);
    if (data < C.EV_ITEM_RAISE_LIMIT) {
      let evDelta = data + itemEffect[idx] > C.EV_ITEM_RAISE_LIMIT ? C.EV_ITEM_RAISE_LIMIT - (data + itemEffect[idx]) + itemEffect[idx] : itemEffect[idx];
      if (evCount + evDelta > C.MAX_TOTAL_EVS) evDelta += C.MAX_TOTAL_EVS - (evCount + evDelta);
      data += evDelta;
      SetMonData(mon, field, data);
      CalculateMonStats(mon);
      idx++;
      retVal = false;
    }
    return false;
  };

  const ppFull = (slot: number) => CalculatePPWithBonus(GetMonData(mon, C.MON_DATA_MOVE1 + slot), GetMonData(mon, C.MON_DATA_PP_BONUSES), slot);

  for (let cmdIndex = 0; cmdIndex < C.ITEM_EFFECT_ARG_START; cmdIndex++) {
    const e = itemEffect[cmdIndex];
    switch (cmdIndex) {
      case 0:
        if (e & C.ITEM0_INFATUATION && gMain.inBattle && battleMonId !== 4 && gBattleMons[battleMonId].status2 & C.STATUS2_INFATUATION) {
          gBattleMons[battleMonId].status2 &= ~C.STATUS2_INFATUATION;
          retVal = false;
        }
        if (e & C.ITEM0_DIRE_HIT && !(active.status2 & C.STATUS2_FOCUS_ENERGY)) {
          active.status2 |= C.STATUS2_FOCUS_ENERGY;
          retVal = false;
        }
        if (e & C.ITEM0_X_ATTACK && active.statStages[C.STAT_ATK] < MAX_STAT_STAGE) raise(C.STAT_ATK, e & C.ITEM0_X_ATTACK);
        break;
      case 1:
        if (e & C.ITEM1_X_DEFEND && active.statStages[C.STAT_DEF] < MAX_STAT_STAGE) raise(C.STAT_DEF, (e & C.ITEM1_X_DEFEND) >> 4);
        if (e & C.ITEM1_X_SPEED && active.statStages[C.STAT_SPEED] < MAX_STAT_STAGE) raise(C.STAT_SPEED, e & C.ITEM1_X_SPEED);
        break;
      case 2:
        if (e & C.ITEM2_X_ACCURACY && active.statStages[C.STAT_ACC] < MAX_STAT_STAGE) raise(C.STAT_ACC, (e & C.ITEM2_X_ACCURACY) >> 4);
        if (e & C.ITEM2_X_SPATK && active.statStages[C.STAT_SPATK] < MAX_STAT_STAGE) raise(C.STAT_SPATK, e & C.ITEM2_X_SPATK);
        break;
      case 3:
        if (e & C.ITEM3_GUARD_SPEC && gSideTimers[GetBattlerSide(a)].mistTimer === 0) {
          gSideTimers[GetBattlerSide(a)].mistTimer = 5;
          retVal = false;
        }
        if (e & C.ITEM3_LEVEL_UP && GetMonData(mon, C.MON_DATA_LEVEL) !== C.MAX_LEVEL) {
          const species = GetMonData(mon, C.MON_DATA_SPECIES);
          SetMonData(mon, C.MON_DATA_EXP, rom.expTables[rom.species[species].growthRate][GetMonData(mon, C.MON_DATA_LEVEL) + 1]);
          CalculateMonStats(mon);
          retVal = false;
        }
        if (e & C.ITEM3_SLEEP && HealStatusConditions(mon, C.STATUS1_SLEEP, battleMonId) === 0) {
          if (battleMonId !== 4) gBattleMons[battleMonId].status2 &= ~C.STATUS2_NIGHTMARE;
          retVal = false;
        }
        if (e & C.ITEM3_POISON && HealStatusConditions(mon, C.STATUS1_PSN_ANY | C.STATUS1_TOXIC_COUNTER, battleMonId) === 0) retVal = false;
        if (e & C.ITEM3_BURN && HealStatusConditions(mon, C.STATUS1_BURN, battleMonId) === 0) retVal = false;
        if (e & C.ITEM3_FREEZE && HealStatusConditions(mon, C.STATUS1_FREEZE, battleMonId) === 0) retVal = false;
        if (e & C.ITEM3_PARALYSIS && HealStatusConditions(mon, C.STATUS1_PARALYSIS, battleMonId) === 0) retVal = false;
        if (e & C.ITEM3_CONFUSION && gMain.inBattle && battleMonId !== 4 && gBattleMons[battleMonId].status2 & C.STATUS2_CONFUSION) {
          gBattleMons[battleMonId].status2 &= ~C.STATUS2_CONFUSION;
          retVal = false;
        }
        break;
      case 4: {
        let val = e;
        if (val & C.ITEM4_PP_UP) {
          val &= ~C.ITEM4_PP_UP;
          const ups = (GetMonData(mon, C.MON_DATA_PP_BONUSES) & gPPUpGetMask[moveIndex]) >> (moveIndex * 2);
          const before = ppFull(moveIndex);
          if (ups < 3 && before > 4) {
            SetMonData(mon, C.MON_DATA_PP_BONUSES, GetMonData(mon, C.MON_DATA_PP_BONUSES) + gPPUpAddValues[moveIndex]);
            SetMonData(mon, C.MON_DATA_PP1 + moveIndex, GetMonData(mon, C.MON_DATA_PP1 + moveIndex) + ppFull(moveIndex) - before);
            retVal = false;
          }
        }
        for (let i = 0; val !== 0; i++, val >>= 1) {
          if (!(val & 1)) continue;
          switch (i) {
            case 0:
            case 1:
              if (raiseEV(sGetMonDataEVConstants[i])) return true;
              break;
            case 2: {
              if (val & (C.ITEM4_REVIVE >> 2)) {
                if (GetMonData(mon, C.MON_DATA_HP) !== 0) {
                  idx++;
                  break;
                }
                if (gMain.inBattle) {
                  if (battleMonId !== 4) {
                    G.gAbsentBattlerFlags &= ~gBitTable[battleMonId];
                    CopyPlayerPartyMonToBattleData(battleMonId, GetPartyIdFromBattlePartyId(gBattlerPartyIndexes[battleMonId]));
                  } else {
                    G.gAbsentBattlerFlags &= ~gBitTable[a ^ 2];
                  }
                  if (GetBattlerSide(a) === C.B_SIDE_PLAYER && gBattleResults.numRevivesUsed < 255) gBattleResults.numRevivesUsed++;
                }
              } else if (GetMonData(mon, C.MON_DATA_HP) === 0) {
                idx++;
                break;
              }
              let data = itemEffect[idx++];
              switch (data) {
                case C.ITEM6_HEAL_HP_FULL: data = GetMonData(mon, C.MON_DATA_MAX_HP) - GetMonData(mon, C.MON_DATA_HP); break;
                case C.ITEM6_HEAL_HP_HALF: data = Math.trunc(GetMonData(mon, C.MON_DATA_MAX_HP) / 2) || 1; break;
                case C.ITEM6_HEAL_HP_LVL_UP: data = gBattleScripting.levelUpHP; break;
              }
              if (GetMonData(mon, C.MON_DATA_MAX_HP) !== GetMonData(mon, C.MON_DATA_HP)) {
                if (!usedByAI) {
                  data = Math.min(GetMonData(mon, C.MON_DATA_HP) + data, GetMonData(mon, C.MON_DATA_MAX_HP));
                  SetMonData(mon, C.MON_DATA_HP, data);
                  if (gMain.inBattle && battleMonId !== 4) {
                    gBattleMons[battleMonId].hp = data;
                    if (!(val & (C.ITEM4_REVIVE >> 2)) && GetBattlerSide(a) === C.B_SIDE_PLAYER) {
                      if (gBattleResults.numHealingItemsUsed < 255) gBattleResults.numHealingItemsUsed++;
                      const saved = G.gActiveBattler;
                      G.gActiveBattler = battleMonId;
                      BtlController_EmitGetMonData(BUFFER_A, C.REQUEST_ALL_BATTLE, 0);
                      MarkBattlerForControllerExec(G.gActiveBattler);
                      G.gActiveBattler = saved;
                    }
                  }
                } else {
                  G.gBattleMoveDamage = -data;
                }
                retVal = false;
              }
              val &= ~(C.ITEM4_REVIVE >> 2);
              break;
            }
            case 3:
              if (!(val & (C.ITEM4_HEAL_PP_ONE >> 3))) {
                for (let r5 = 0; r5 < C.MAX_MON_MOVES; r5++) {
                  let data = GetMonData(mon, C.MON_DATA_PP1 + r5);
                  if (data !== ppFull(r5)) {
                    data = Math.min(data + itemEffect[idx], ppFull(r5));
                    SetMonData(mon, C.MON_DATA_PP1 + r5, data);
                    if (gMain.inBattle && battleMonId !== 4 && MOVE_IS_PERMANENT(battleMonId, r5, gDisableStructs[battleMonId])) gBattleMons[battleMonId].pp[r5] = data;
                    retVal = false;
                  }
                }
                idx++;
              } else {
                let data = GetMonData(mon, C.MON_DATA_PP1 + moveIndex);
                if (data !== ppFull(moveIndex)) {
                  data = Math.min(data + itemEffect[idx++], ppFull(moveIndex));
                  SetMonData(mon, C.MON_DATA_PP1 + moveIndex, data);
                  if (gMain.inBattle && battleMonId !== 4 && MOVE_IS_PERMANENT(battleMonId, moveIndex, gDisableStructs[battleMonId])) gBattleMons[battleMonId].pp[moveIndex] = data;
                  retVal = false;
                }
              }
              break;
            case 7: {
              const target = GetEvolutionTargetSpecies(mon, C.EVO_MODE_ITEM_USE, item);
              if (target !== C.SPECIES_NONE) {
                EvolutionScene(mon, target, false, partyIndex);
                return false;
              }
              break;
            }
          }
        }
        break;
      }
      case 5: {
        let val = e;
        for (let i = 0; val !== 0; i++, val >>= 1) {
          if (!(val & 1)) continue;
          switch (i) {
            case 0: case 1: case 2: case 3:
              if (raiseEV(sGetMonDataEVConstants[i + 2])) return true;
              break;
            case 4: {
              const ups = (GetMonData(mon, C.MON_DATA_PP_BONUSES) & gPPUpGetMask[moveIndex]) >> (moveIndex * 2);
              if (ups < 3) {
                const before = ppFull(moveIndex);
                const bonuses = (GetMonData(mon, C.MON_DATA_PP_BONUSES) & gPPUpClearMask[moveIndex]) + gPPUpAddValues[moveIndex] * 3;
                SetMonData(mon, C.MON_DATA_PP_BONUSES, bonuses);
                SetMonData(mon, C.MON_DATA_PP1 + moveIndex, GetMonData(mon, C.MON_DATA_PP1 + moveIndex) + ppFull(moveIndex) - before);
                retVal = false;
              }
              break;
            }
            case 5:
              if (GetMonData(mon, C.MON_DATA_FRIENDSHIP) < 100) updateFriendship();
              idx++;
              break;
            case 6: {
              const f = GetMonData(mon, C.MON_DATA_FRIENDSHIP);
              if (f >= 100 && f < 200) updateFriendship();
              idx++;
              break;
            }
            case 7:
              if (GetMonData(mon, C.MON_DATA_FRIENDSHIP) >= 200) updateFriendship();
              idx++;
              break;
          }
        }
        break;
      }
    }
  }
  return retVal;
}
