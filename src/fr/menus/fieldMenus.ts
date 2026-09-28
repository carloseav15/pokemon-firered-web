// Field entry points of the BAG (item_use.c field functions) and the POKéMON
// party menu (partyMenu.ts), with the field side the menus hand off to.
import type { Game } from "../game";
import { HwScene } from "../hw/runtime";
import { openMailView } from "./mailView";
import { blankMail, mailLines } from "../pokemon/mail";
import { decode, intToDecimal, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { rom } from "../rom";
import { flagClear, flagSet, save, varGet, varSet } from "../save";
import { GetCoins, ItemId_GetFieldFunc, itemInfo, itemName } from "../pokemon/items";
import { trySetUpFieldMove } from "./fieldMoveMenu";
import { openFlyMap, openRegionMap, REGIONMAP_TYPE_NORMAL } from "../regionMap";
import { bagResult, GoToBagMenu, RemoveUsedItem, type BagHandlers, type BagTaskContext } from "../bagMenu";
import { InitTMCase } from "../tmCase";
import { InitBerryPouch } from "../berryPouch";
import {
  CB2_ChooseMonToGiveItem, CB2_PartyMenuFromStartMenu, CB2_ShowPartyMenuForItemUse, ItemUseCB_EvolutionStone, ItemUseCB_Medicine, ItemUseCB_PPUp,
  ItemUseCB_RareCandy, ItemUseCB_SacredAsh, ItemUseCB_TMHM, ItemUseCB_TryRestorePP, GetItemEffectType, SetItemUseCB, SetItemUseReturns, SetPartyMenuFieldHooks,
  type PartyMenuFieldHooks,
} from "../partyMenu";
import { relearnableMoves } from "../pokemon/partyRules";
import { encode, stringVars } from "../gba/charmap";
type ItemUseCB = Parameters<typeof SetItemUseCB>[0] & {};
import { PokemonUseItemEffects } from "../battle/ext";
import type { Mon } from "../pokemon/mon";
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import * as MB from "../generated/metatileBehavior";
import { joy, A_BUTTON, B_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { DIRECTION_VECTORS } from "../field/objectEvents";
import { PLAYER_AVATAR_FLAG_ACRO_BIKE, PLAYER_AVATAR_FLAG_MACH_BIKE, PLAYER_AVATAR_FLAG_UNDERWATER, PlayerGetDestCoords } from "../field/playerAvatar";
import { startFishing } from "../field/fishing";
import { startItemFinder } from "./itemFinder";
import { openHardwareMessage } from "./hardwareChoice";
import { BeginEvolutionScene } from "../evolutionScene";
import { flagGet, incrementGameStat } from "../save";
import { GetBerryPowder } from "../script/specialsExtra";
import { ItemUse_SetQuestLogEvent } from "../itemUse";


export function fieldMenu(game: Game, begin: (close: () => void) => void, closeStartMenu = true): void {
  const scene = new HwScene(); scene.enter(); game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  begin(() => {
    scene.leave(); game.scene = null;
    game.setCallbacks(() => game.overworld.cb1(), () => game.overworld.cb2());
    if (closeStartMenu) game.closeStartMenu();
  });
}

/** The field side of party_menu.c: field moves, the fly map, mail and evolution. */
function fieldPartyHooks(game: Game, leaveWith: (post: (() => void) | null) => void): PartyMenuFieldHooks {
  return {
    setUpFieldMove: (fieldMove, slot) => trySetUpFieldMove(game, fieldMove, slot),
    returnToField: (post) => leaveWith(post),
    // CB2_OpenFlyMap: ReturnToFieldFromFlyMapSelect (FieldCallback_UseFly) or back to the party.
    openFlyMap: (slot, done) => openFlyMap(game, (selected) => {
      if (!selected) { done(false); return; }
      done(true);
      leaveWith(() => {
        game.fieldEffectArguments[0] = slot;
        game.overworld.effects.moves.startFly();
      });
    }),
    readMail: (slot, done) => {
      const mon = save.party[slot];
      const msg = mon.mailMessage ?? blankMail();
      openMailView(decode(itemName(mon.heldItem)), mailLines(msg.words), msg.author.length ? decode(Uint8Array.from(msg.author)) : "", done);
    },
    evolve: (mon, target, canStop, slot, done) => BeginEvolutionScene(mon, target, canStop, slot, done),
    relearnableMoves: (mon) => relearnableMoves(mon).length,
  };
}

/** CB2_PartyMenuFromStartMenu → CB2_ReturnToFieldWithOpenMenu (or a field move's callback). */
export function openFieldParty(game: Game): void {
  fieldMenu(game, close => {
    const leaveWith = (post: (() => void) | null): void => {
      close();
      if (post) { game.closeStartMenu(); post(); } else game.showStartMenu();
    };
    SetPartyMenuFieldHooks(fieldPartyHooks(game, leaveWith));
    CB2_PartyMenuFromStartMenu(() => leaveWith(null));
  }, false);
}

/**
 * The BAG from the start menu (CB2_BagMenuFromStartMenu → CB2_ReturnToFieldWithOpenMenu)
 * or a registered item (UseRegisteredKeyItemOnField, `initialItem`). The bag
 * screen is bagMenu.ts; this supplies what each item does (item_use.c).
 * While a field function runs from the bag, `bagCtx` is its bag task: plain
 * messages print in the bag, and flows that need another screen leave it first.
 */
/** FieldUseFunc_OakStopsYou from item_use.c; `display` keeps the caller's bag/pouch context. */
export function FieldUseFunc_OakStopsYou(display: (text: Uint8Array) => void): void {
  stringVars.var1 = Uint8Array.from(save.playerName);
  display(rom.text("gText_OakForbidsUseOfItemHere"));
}

/** Task_UsedBlackWhiteFlute from item_use.c: tick data[8], play after eight frames, then show the context message. */
export function Task_UsedBlackWhiteFlute(taskId: number, done: () => void): void {
  if (++tasks.data(taskId)[8]! > 7) {
    sound.playSE(C.SE_GLASS_FLUTE);
    tasks.destroy(taskId);
    done();
  }
}

/** Task_PlayPokeFlute from item_use.c: play the fanfare, then hand the same task to its wait callback. */
export function Task_PlayPokeFlute(taskId: number, isFanfareDone: () => boolean, done: () => void): void {
  sound.playFanfare(C.MUS_POKE_FLUTE);
  tasks.setFunc(taskId, (id) => Task_DisplayPokeFluteMessage(id, isFanfareDone, done));
}

/** Task_DisplayPokeFluteMessage from item_use.c: wait until the fanfare callback completes. */
export function Task_DisplayPokeFluteMessage(taskId: number, isFanfareDone: () => boolean, done: () => void): void {
  if (!isFanfareDone()) return;
  tasks.destroy(taskId);
  done();
}

/** Task_UseRepel from item_use.c: wait for SE completion before consuming Repel and setting its step counter. */
export function Task_UseRepel(taskId: number, item: number, onDone: (text: Uint8Array) => void): void {
  if (sound.isSEPlaying()) return;
  ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
  varSet(C.VAR_REPEL_STEP_COUNT, itemInfo(item)?.holdEffectParam ?? 0);
  const text = RemoveUsedItem(item);
  tasks.destroy(taskId);
  onDone(text);
}

/** ItemUseOutOfBattle_EnigmaBerry dispatch from item_use.c; effect data selects the real field handler. */
export function ItemUseOutOfBattle_EnigmaBerry(item: number, use: {
  medicine: () => void; sacredAsh: () => void; rareCandy: () => void; ppUp: () => void; ether: () => void; oakStopsYou: () => void;
}): void {
  switch (GetItemEffectType(item)) {
    case C.ITEM_EFFECT_HEAL_HP: case C.ITEM_EFFECT_CURE_POISON: case C.ITEM_EFFECT_CURE_SLEEP:
    case C.ITEM_EFFECT_CURE_BURN: case C.ITEM_EFFECT_CURE_FREEZE: case C.ITEM_EFFECT_CURE_PARALYSIS:
    case C.ITEM_EFFECT_CURE_ALL_STATUS: case C.ITEM_EFFECT_ATK_EV: case C.ITEM_EFFECT_HP_EV:
    case C.ITEM_EFFECT_SPATK_EV: case C.ITEM_EFFECT_SPDEF_EV: case C.ITEM_EFFECT_SPEED_EV: case C.ITEM_EFFECT_DEF_EV:
      use.medicine(); return;
    case C.ITEM_EFFECT_SACRED_ASH: use.sacredAsh(); return;
    case C.ITEM_EFFECT_RAISE_LEVEL: use.rareCandy(); return;
    case C.ITEM_EFFECT_PP_UP: case C.ITEM_EFFECT_PP_MAX: use.ppUp(); return;
    case C.ITEM_EFFECT_HEAL_PP: use.ether(); return;
    default: use.oakStopsYou(); return;
  }
}

/** FieldUseFunc_TmCase (item_use.c): choose the C bag or field handoff. */
export function FieldUseFunc_TmCase(fromBag: boolean, fromBagCallback: () => void, fromFieldCallback: () => void): void {
  (fromBag ? fromBagCallback : fromFieldCallback)();
}

/** InitTMCaseFromBag (item_use.c): open TMCASE_FIELD with the bag as its return target. */
export function InitTMCaseFromBag(open: () => void): void { open(); }

/** Task_InitTMCaseFromField (item_use.c): open TMCASE_FIELD with the field as its return target. */
export function Task_InitTMCaseFromField(open: () => void): void { open(); }

/** FieldUseFunc_BerryPouch (item_use.c): choose the C bag or field handoff. */
export function FieldUseFunc_BerryPouch(fromBag: boolean, fromBagCallback: () => void, fromFieldCallback: () => void): void {
  (fromBag ? fromBagCallback : fromFieldCallback)();
}

/** InitBerryPouchFromBag (item_use.c): open the pouch with the bag as its return target. */
export function InitBerryPouchFromBag(open: () => void): void { open(); }

/** Task_InitBerryPouchFromField (item_use.c): open the pouch with the field as its return target. */
export function Task_InitBerryPouchFromField(open: () => void): void { open(); }

/** FieldUseFunc_Mail (item_use.c): fade the bag out, then run CB2_CheckMail. */
export function FieldUseFunc_Mail(exitToMail: (checkMail: () => void) => void, checkMail: () => void): void {
  exitToMail(checkMail);
}

/** CB2_CheckMail (item_use.c): ReadMail uses only itemId when messageExists is FALSE. */
export function CB2_CheckMail(item: number, returnToBag: () => void): void {
  openMailView(decode(itemName(item)), [], "", returnToBag);
}

/** ItemUseOnFieldCB_Bicycle (item_use.c): toggle the bike and release field controls. */
export function ItemUseOnFieldCB_Bicycle(game: Game): void {
  const ow = game.overworld;
  if (!(ow.player.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE))) sound.playSE(C.SE_BIKE_BELL);
  ow.player.GetOnOffBike(PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE);
  ow.objects.ObjectEventClearHeldMovementIfFinished(ow.player.object);
  ow.game.scriptMovement.unfreezeAndStop();
  ow.objects.unfreezeAll();
  ow.controlsLocked = false;
}

/** FieldUseFunc_Bike (item_use.c): C rail, map-permission and player-ban checks. */
export function FieldUseFunc_Bike(game: Game, route: {
  cantDismount: () => void; notNow: () => void; onField: (callback: () => void) => void;
}): void {
  const ow = game.overworld;
  const { x, y } = PlayerGetDestCoords();
  const behavior = ow.map.behaviorAt(x, y);
  if (flagGet(C.FLAG_SYS_ON_CYCLING_ROAD) || MB.MetatileBehavior_IsVerticalRail(behavior) || MB.MetatileBehavior_IsHorizontalRail(behavior)
    || MB.MetatileBehavior_IsIsolatedVerticalRail(behavior) || MB.MetatileBehavior_IsIsolatedHorizontalRail(behavior)) {
    route.cantDismount();
  } else if (ow.header.allowCycling && !ow.player.IsBikingDisallowedByPlayer()) {
    route.onField(() => ItemUseOnFieldCB_Bicycle(game));
  } else {
    route.notNow();
  }
}

/** ItemUseOnFieldCB_Rod (item_use.c): start the selected rod's fishing state. */
function ItemUseOnFieldCB_Rod(game: Game, rodType: number): void {
  startFishing(game.overworld, rodType);
}

/** ItemUseOutOfBattle_Itemfinder (item_use.c): count the use before entering its field callback. */
export function ItemUseOutOfBattle_Itemfinder(game: Game, onField: (callback: () => void) => void): void {
  incrementGameStat(C.GAME_STAT_USED_ITEMFINDER);
  onField(() => startItemFinder(game));
}

/** CanUseEscapeRopeOnCurrMap (item_use.c): use the map header's escape gate. */
export function CanUseEscapeRopeOnCurrMap(game: Game): boolean {
  return game.overworld.header.allowEscaping;
}

/** ItemUseOutOfBattle_EscapeRope (item_use.c): hand off to the field callback only on allowed maps. */
export function ItemUseOutOfBattle_EscapeRope(game: Game, item: number, route: {
  notNow: () => void; onField: (callback: () => void) => void;
}): void {
  if (!CanUseEscapeRopeOnCurrMap(game)) {
    route.notNow();
    return;
  }
  ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, game.overworld.header.regionMapSection);
  route.onField(() => ItemUseOnFieldCB_EscapeRope(game, item));
}

/** FieldUseFunc_CoinCase (item_use.c): format the four-digit balance and show it in the caller's context. */
export function FieldUseFunc_CoinCase(item: number, display: (text: ArrayLike<number>) => void): void {
  stringVars.var1 = intToDecimal(GetCoins(), STR_CONV_MODE_LEFT_ALIGN, 4);
  ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
  display(rom.text("gText_CoinCase"));
}

/** FieldUseFunc_PowderJar (item_use.c): format the five-digit powder balance and show it in context. */
export function FieldUseFunc_PowderJar(item: number, display: (text: ArrayLike<number>) => void): void {
  stringVars.var1 = intToDecimal(GetBerryPowder(), STR_CONV_MODE_LEFT_ALIGN, 5);
  ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
  display(rom.text("gText_PowderQty"));
}

/** ItemUseOnFieldCB_EscapeRope (item_use.c): reset field state, consume the item, and print its message. */
function ItemUseOnFieldCB_EscapeRope(game: Game, item: number): void {
  game.overworld.resetStateAfterDigEscRope();
  fieldMessage(game, RemoveUsedItem(item), () => Task_UseDigEscapeRopeOnField(game));
}

/** Task_UseDigEscapeRopeOnField (item_use.c): the message task is already destroyed by fieldMessage. */
function Task_UseDigEscapeRopeOnField(game: Game): void {
  game.overworld.resetInitialPlayerAvatarState();
  game.overworld.effects.moves.startEscapeRope();
}

/** FieldUseFunc_Rod (item_use.c): gate the rod, then enter the field callback. */
export function FieldUseFunc_Rod(game: Game, item: number, route: {
  notNow: () => void; onField: (callback: () => void) => void;
}): void {
  if (!CanFish(game)) {
    route.notNow();
    return;
  }
  route.onField(() => ItemUseOnFieldCB_Rod(game, itemInfo(item)?.secondaryId ?? 0));
}

export function openFieldBag(game: Game, initialItem?: number): void {
  let post: (() => void) | null = null;
  fieldMenu(game, close => {
    const finish = (): void => {
      close();
      const cb = post;
      post = null;
      if (cb) { game.closeStartMenu(); cb(); }
      else if (initialItem === undefined) game.showStartMenu();
      else game.closeStartMenu();
    };
    let bagCtx: BagTaskContext | null = null;
    /** Leave the bag (ItemMenu_SetExitCallback + fade) and continue with `flow`. */
    const leave = (flow: () => void): void => {
      const ctx = bagCtx;
      bagCtx = null;
      if (ctx) ctx.exit(flow); else flow();
    };
    const onField = (cb: () => void): void => leave(() => {
      post = () => { game.overworld.controlsLocked = true; game.overworld.objects.freezeAll(); cb(); };
      finish();
    });
    const message = (title: string | ArrayLike<number>, next: () => void = back): void => {
      const bytes = typeof title === "string" ? encode(title) : title;
      if (bagCtx && next === back) { const ctx = bagCtx; bagCtx = null; ctx.message(bytes); return; }
      leave(() => openHardwareMessage(bytes, next));
    };
    const notNow = (next: () => void = back): void => FieldUseFunc_OakStopsYou((text) => message(text, next));
    /** gItemUseCB = cb; CB2_ShowPartyMenuForItemUse, back to the bag / TM case / berry pouch. */
    const partyItemUse = (item: number, cb: ItemUseCB): void => leave(() => {
      bagResult.itemId = item;
      SetItemUseCB(cb);
      CB2_ShowPartyMenuForItemUse();
    });
    const medicine = (item: number): void => {
      const func = ItemId_GetFieldFunc(item);
      partyItemUse(item, func === "FieldUseFunc_PpUp" ? ItemUseCB_PPUp : func === "FieldUseFunc_Ether" ? ItemUseCB_TryRestorePP : ItemUseCB_Medicine);
    };
    const rareCandy = (item: number): void => partyItemUse(item, ItemUseCB_RareCandy);
    const evolutionStone = (item: number): void => partyItemUse(item, ItemUseCB_EvolutionStone);
    const sacredAsh = (item: number): void => partyItemUse(item, ItemUseCB_SacredAsh);
    /** tm_case.c UseTM: after "Booted up a TM", the party menu with ItemUseCB_TMHM. */
    const useTM = (item: number): void => {
      bagResult.itemId = item;
      SetItemUseCB(ItemUseCB_TMHM);
      CB2_ShowPartyMenuForItemUse();
    };
    /** tm_case.c: InitTMCase(TMCASE_FIELD, bag), reopened after a USE/GIVE (TMCASE_REOPENING). */
    const tmHandlers = { useOnMon: (item: number) => useTM(item), giveToMon: (item: number) => giveItem(item) };
    const openTmCase = (): void => InitTMCase(C.TMCASE_FIELD, bag, false, tmHandlers);
    const tmCase = (): void => InitTMCase(C.TMCASE_REOPENING, null, C.TMCASE_KEEP_PREV, tmHandlers);
    /** CB2_ChooseMonToGiveItem */
    const giveItem = (item: number): void => {
      bagResult.itemId = item;
      CB2_ChooseMonToGiveItem();
    };
    const use = (item: number): void => {
      const ow = game.overworld;
      switch (ItemId_GetFieldFunc(item)) {
        case "FieldUseFunc_Medicine": case "FieldUseFunc_Ether": case "FieldUseFunc_PpUp": leave(() => medicine(item)); return;
        case "FieldUseFunc_RareCandy": leave(() => rareCandy(item)); return;
        case "FieldUseFunc_EvoItem": leave(() => evolutionStone(item)); return;
        case "FieldUseFunc_SacredAsh": leave(() => sacredAsh(item)); return;
        case "FieldUseFunc_Repel":
          if (varGet(C.VAR_REPEL_STEP_COUNT)) { message(rom.text("gText_RepelEffectsLingered")); return; }
          sound.playSE(C.SE_REPEL);
          {
            const context = bagCtx;
            tasks.create((taskId) => Task_UseRepel(taskId, item, (text) => {
              if (context) context.message(text); else message(text);
            }), 80);
          }
          return;
        case "FieldUseFunc_BlackWhiteFlute": {
          ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
          const white = item === C.ITEM_WHITE_FLUTE;
          flagSet(white ? C.FLAG_SYS_WHITE_FLUTE_ACTIVE : C.FLAG_SYS_BLACK_FLUTE_ACTIVE);
          flagClear(white ? C.FLAG_SYS_BLACK_FLUTE_ACTIVE : C.FLAG_SYS_WHITE_FLUTE_ACTIVE);
          stringVars.var2 = itemName(item);
          const text = rom.text(white ? "gText_UsedVar2WildLured" : "gText_UsedVar2WildRepelled");
          const context = bagCtx;
          tasks.create((taskId) => Task_UsedBlackWhiteFlute(taskId, () => {
            if (context) context.message(text); else message(text);
          }), 80);
          return;
        }
        case "FieldUseFunc_PokeFlute": {
          let woke = false;
          save.party.forEach((mon, i) => { if (!mon.isEgg && !PokemonUseItemEffects(mon as Mon, C.ITEM_AWAKENING, i, 0, false)) woke = true; });
          if (!woke) { message(rom.text("gText_PlayedPokeFluteCatchy")); return; }
          ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
          message(rom.text("gText_PlayedPokeFlute"), () => {
            tasks.create((taskId) => Task_PlayPokeFlute(taskId, () => sound.isFanfareTaskInactive(), () => {
              message(rom.text("gText_PokeFluteAwakenedMon"));
            }), 80);
          });
          return;
        }
        case "FieldUseFunc_CoinCase": FieldUseFunc_CoinCase(item, message); return;
        case "FieldUseFunc_PowderJar": FieldUseFunc_PowderJar(item, message); return;
        case "FieldUseFunc_TmCase":
          FieldUseFunc_TmCase(bagCtx !== null,
            () => leave(() => InitTMCaseFromBag(openTmCase)),
            () => onField(() => Task_InitTMCaseFromField(() => InitTMCase(C.TMCASE_FIELD, finish, true, tmHandlers))));
          return;
        case "FieldUseFunc_BerryPouch":
          FieldUseFunc_BerryPouch(bagCtx !== null,
            () => leave(() => InitBerryPouchFromBag(berryPouch)),
            () => onField(() => Task_InitBerryPouchFromField(() => InitBerryPouch(C.BERRYPOUCH_FROMFIELD, finish, 1, pouchHandlers))));
          return;
        case "FieldUseFunc_Bike":
          FieldUseFunc_Bike(game, {
            cantDismount: () => message(rom.text("gText_CantDismountBike")),
            notNow,
            onField,
          });
          return;
        case "FieldUseFunc_Rod":
          FieldUseFunc_Rod(game, item, { notNow, onField });
          return;
        case "ItemUseOutOfBattle_EscapeRope":
          ItemUseOutOfBattle_EscapeRope(game, item, { notNow, onField });
          return;
        case "ItemUseOutOfBattle_Itemfinder":
          ItemUseOutOfBattle_Itemfinder(game, onField);
          return;
        case "FieldUseFunc_TownMap":
          // From the bag the map returns to the bag (CB2_BagMenuFromStartMenu); a registered use returns to the field.
          if (initialItem !== undefined) onField(() => game.showTownMapFromField());
          else leave(() => openRegionMap(game, REGIONMAP_TYPE_NORMAL, bag));
          return;
        case "FieldUseFunc_FameChecker":
          ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
          onField(() => game.openFameChecker()); return;
        case "FieldUseFunc_TeachyTv":
          ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
          onField(() => game.openTeachyTv()); return;
        case "FieldUseFunc_VsSeeker": onField(() => game.useVsSeeker()); return;
        case "FieldUseFunc_Mail":
          FieldUseFunc_Mail((checkMail) => leave(checkMail), () => CB2_CheckMail(item, bag));
          return;
        case "ItemUseOutOfBattle_EnigmaBerry":
          ItemUseOutOfBattle_EnigmaBerry(item, {
            medicine: () => leave(() => medicine(item)),
            sacredAsh: () => leave(() => sacredAsh(item)),
            rareCandy: () => leave(() => rareCandy(item)),
            ppUp: () => leave(() => partyItemUse(item, ItemUseCB_PPUp)),
            ether: () => leave(() => partyItemUse(item, ItemUseCB_TryRestorePP)),
            oakStopsYou: () => notNow(),
          });
          return;
        default: notNow(); return;
      }
    };
    /** berry_pouch.c: InitBerryPouch(BERRYPOUCH_FROMFIELD, bag); the same item functions as the bag. */
    const pouchHandlers = {
      fieldUse: (item: number, ctx: BagTaskContext) => { bagCtx = ctx; use(item); bagCtx = null; },
      giveToMon: (item: number) => giveItem(item),
    };
    const berryPouch = (): void => InitBerryPouch(C.BERRYPOUCH_FROMFIELD, bag, 0, pouchHandlers);
    const handlers: BagHandlers = {
      fieldUse: (item, ctx) => { bagCtx = ctx; use(item); bagCtx = null; },
      giveToMon: (item) => giveItem(item),
      isOnBike: () => game.overworld.player.isOnBike(),
    };
    /** GoToBagMenu(ITEMMENULOCATION_FIELD, OPEN_BAG_LAST, ...) */
    const bag = (): void => GoToBagMenu(C.ITEMMENULOCATION_FIELD, C.OPEN_BAG_LAST, finish, handlers);
    SetItemUseReturns({ bag, tmCase, berryPouch: () => InitBerryPouch(C.BERRYPOUCH_NA, null, 0xff, pouchHandlers) });
    SetPartyMenuFieldHooks(fieldPartyHooks(game, (p) => { post = p; finish(); }));
    const back = initialItem !== undefined ? finish : bag;
    if (initialItem !== undefined) use(initialItem); else bag();
  });
}

/** item_use.c CanFish */
function CanFish(game: Game): boolean {
  const ow = game.overworld;
  const p = ow.player.object;
  const [dx, dy] = DIRECTION_VECTORS[p.facingDirection];
  const x = p.currentCoords.x + dx, y = p.currentCoords.y + dy;
  const behavior = ow.map.behaviorAt(x, y);
  if (MB.MetatileBehavior_IsWaterfall(behavior)) return false;
  if (ow.player.flags & PLAYER_AVATAR_FLAG_UNDERWATER) return false;
  if (!ow.player.isSurfing()) return ow.player.IsPlayerFacingSurfableFishableWater();
  if (MB.MetatileBehavior_IsSurfable(behavior) && ow.map.collisionAt(x, y) === 0) return true;
  return MB.MetatileBehavior_IsBridge(behavior);
}

/** DisplayItemMessageOnField: field message box, then `next` once dismissed. */
export function fieldMessage(game: Game, text: ArrayLike<number>, next: () => void): void {
  const ow = game.overworld;
  ow.control.MsgSetNotSignpost();
  ow.messageBox.show(text);
  const id = tasks.create(() => {
    if (!ow.messageBox.isHidden()) return;
    if (!(joy.newKeys & (A_BUTTON | B_BUTTON))) return;
    ow.messageBox.hide();
    tasks.destroy(id);
    next();
  }, 80);
}
