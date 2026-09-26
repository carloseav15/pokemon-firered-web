// Field entry points of the BAG (item_use.c field functions) and the POKéMON
// party menu (partyMenu.ts), with the field side the menus hand off to.
import type { Game } from "../game";
import { HwScene } from "../hw/runtime";
import { openMailView } from "./mailView";
import { blankMail, mailLines } from "../pokemon/mail";
import { decode } from "../gba/charmap";
import { rom } from "../rom";
import { flagClear, flagSet, save, varGet, varSet } from "../save";
import { GetCoins, itemInfo, itemName, removeBagItem } from "../pokemon/items";
import { trySetUpFieldMove } from "./fieldMoveMenu";
import { openFlyMap, openRegionMap, REGIONMAP_TYPE_NORMAL } from "../regionMap";
import { bagResult, GoToBagMenu, type BagHandlers, type BagTaskContext } from "../bagMenu";
import { InitTMCase } from "../tmCase";
import { InitBerryPouch } from "../berryPouch";
import {
  CB2_ChooseMonToGiveItem, CB2_PartyMenuFromStartMenu, CB2_ShowPartyMenuForItemUse, ItemUseCB_EvolutionStone, ItemUseCB_Medicine, ItemUseCB_PPUp,
  ItemUseCB_RareCandy, ItemUseCB_SacredAsh, ItemUseCB_TMHM, ItemUseCB_TryRestorePP, SetItemUseCB, SetItemUseReturns, SetPartyMenuFieldHooks,
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
import { DIRECTION_VECTORS, DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from "../field/objectEvents";
import { PLAYER_AVATAR_FLAG_ACRO_BIKE, PLAYER_AVATAR_FLAG_MACH_BIKE } from "../field/playerAvatar";
import { startFishing } from "../field/fishing";
import { openHardwareMessage } from "./hardwareChoice";
import { BeginEvolutionScene } from "../evolutionScene";
import { flagGet, incrementGameStat, SV } from "../save";


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
    const notNow = (next: () => void = back): void => {
      stringVars.var1 = Uint8Array.from(save.playerName);
      message(rom.text("gText_OakForbidsUseOfItemHere"), next);
    };
    /** gItemUseCB = cb; CB2_ShowPartyMenuForItemUse, back to the bag / TM case / berry pouch. */
    const partyItemUse = (item: number, cb: ItemUseCB): void => leave(() => {
      bagResult.itemId = item;
      SetItemUseCB(cb);
      CB2_ShowPartyMenuForItemUse();
    });
    const medicine = (item: number): void => {
      const func = itemInfo(item)!.fieldUseFunc;
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
      const info = itemInfo(item)!;
      const ow = game.overworld;
      switch (info.fieldUseFunc) {
        case "FieldUseFunc_Medicine": case "FieldUseFunc_Ether": case "FieldUseFunc_PpUp": leave(() => medicine(item)); return;
        case "FieldUseFunc_RareCandy": leave(() => rareCandy(item)); return;
        case "FieldUseFunc_EvoItem": leave(() => evolutionStone(item)); return;
        case "FieldUseFunc_SacredAsh": leave(() => sacredAsh(item)); return;
        case "FieldUseFunc_Repel":
          if (varGet(C.VAR_REPEL_STEP_COUNT)) { message(rom.text("gText_RepelEffectsLingered")); return; }
          if (removeBagItem(item, 1)) { varSet(C.VAR_REPEL_STEP_COUNT, info.holdEffectParam); sound.playSE(C.SE_REPEL); }
          stringVars.var1 = Uint8Array.from(save.playerName);
          stringVars.var2 = itemName(item);
          message(rom.text("gText_PlayerUsedVar2")); return;
        case "FieldUseFunc_BlackWhiteFlute": {
          const white = item === C.ITEM_WHITE_FLUTE;
          flagSet(white ? C.FLAG_SYS_WHITE_FLUTE_ACTIVE : C.FLAG_SYS_BLACK_FLUTE_ACTIVE);
          flagClear(white ? C.FLAG_SYS_BLACK_FLUTE_ACTIVE : C.FLAG_SYS_WHITE_FLUTE_ACTIVE);
          sound.playSE(C.SE_GLASS_FLUTE);
          stringVars.var2 = itemName(item);
          message(rom.text(white ? "gText_UsedVar2WildLured" : "gText_UsedVar2WildRepelled")); return;
        }
        case "FieldUseFunc_PokeFlute": {
          let woke = false;
          save.party.forEach((mon, i) => { if (!mon.isEgg && !PokemonUseItemEffects(mon as Mon, C.ITEM_AWAKENING, i, 0, false)) woke = true; });
          if (!woke) { message(rom.text("gText_PlayedPokeFluteCatchy")); return; }
          message(rom.text("gText_PlayedPokeFlute"), () => {
            sound.playFanfare(C.MUS_POKE_FLUTE);
            message(rom.text("gText_PokeFluteAwakenedMon"));
          });
          return;
        }
        case "FieldUseFunc_CoinCase": stringVars.var1 = encode(String(GetCoins())); message(rom.text("gText_CoinCase")); return;
        case "FieldUseFunc_PowderJar": stringVars.var1 = encode(String(save.berryPowder ?? 0)); message(rom.text("gText_PowderQty")); return;
        case "FieldUseFunc_TmCase": leave(openTmCase); return;
        case "FieldUseFunc_BerryPouch": leave(berryPouch); return;
        case "FieldUseFunc_Bike": {
          const p = ow.player.object;
          const behavior = ow.map.behaviorAt(p.currentCoords.x, p.currentCoords.y);
          if (flagGet(C.FLAG_SYS_ON_CYCLING_ROAD) || MB.MetatileBehavior_IsVerticalRail(behavior) || MB.MetatileBehavior_IsHorizontalRail(behavior)
            || MB.MetatileBehavior_IsIsolatedVerticalRail(behavior) || MB.MetatileBehavior_IsIsolatedHorizontalRail(behavior)) {
            message(rom.text("gText_CantDismountBike")); return;
          }
          if (!ow.header.allowCycling || ow.player.isBikingDisallowedByPlayer()) { notNow(); return; }
          onField(() => {
            if (!ow.player.isOnBike()) sound.playSE(C.SE_BIKE_BELL);
            ow.player.getOnOffBike(PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE);
            ow.objects.clearHeldMovementIfFinished(ow.player.object);
            ow.objects.unfreezeAll();
            ow.controlsLocked = false;
          });
          return;
        }
        case "FieldUseFunc_Rod":
          if (!canFish(game)) { notNow(); return; }
          onField(() => startFishing(ow, info.secondaryId));
          return;
        case "ItemUseOutOfBattle_EscapeRope":
          if (!ow.header.allowEscaping) { notNow(); return; }
          onField(() => {
            ow.resetStateAfterDigEscRope();
            removeBagItem(item, 1);
            stringVars.var1 = Uint8Array.from(save.playerName);
            stringVars.var2 = itemName(item);
            fieldMessage(game, rom.text("gText_PlayerUsedVar2"), () => { ow.resetInitialPlayerAvatarState(); ow.effects.moves.startEscapeRope(); });
          });
          return;
        case "ItemUseOutOfBattle_Itemfinder":
          incrementGameStat(C.GAME_STAT_USED_ITEMFINDER);
          onField(() => useItemfinder(game));
          return;
        case "FieldUseFunc_TownMap":
          // From the bag the map returns to the bag (CB2_BagMenuFromStartMenu); a registered use returns to the field.
          if (initialItem !== undefined) onField(() => game.showTownMapFromField());
          else leave(() => openRegionMap(game, REGIONMAP_TYPE_NORMAL, bag));
          return;
        case "FieldUseFunc_FameChecker": onField(() => game.openFameChecker()); return;
        case "FieldUseFunc_TeachyTv": onField(() => game.openTeachyTv()); return;
        case "FieldUseFunc_VsSeeker": onField(() => game.useVsSeeker()); return;
        case "FieldUseFunc_Mail": leave(() => openMailView(decode(itemName(item)), [], "", bag)); return;
        case "ItemUseOutOfBattle_EnigmaBerry": leave(() => medicine(item)); return;
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
function canFish(game: Game): boolean {
  const ow = game.overworld;
  const p = ow.player.object;
  const [dx, dy] = DIRECTION_VECTORS[p.facingDirection];
  const x = p.currentCoords.x + dx, y = p.currentCoords.y + dy;
  const behavior = ow.map.behaviorAt(x, y);
  if (MB.MetatileBehavior_IsWaterfall(behavior)) return false;
  if (!ow.player.isSurfing()) return ow.player.isFacingSurfableWater();
  if (MB.MetatileBehavior_IsSurfable(behavior) && ow.map.collisionAt(x, y) === 0) return true;
  return MB.MetatileBehavior_IsBridge(behavior);
}

/** DisplayItemMessageOnField: field message box, then `next` once dismissed. */
export function fieldMessage(game: Game, text: ArrayLike<number>, next: () => void): void {
  const ow = game.overworld;
  ow.control.msgIsSignpost = false;
  ow.messageBox.show(text);
  const id = tasks.create(() => {
    if (!ow.messageBox.isHidden()) return;
    if (!(joy.newKeys & (A_BUTTON | B_BUTTON))) return;
    ow.messageBox.hide();
    tasks.destroy(id);
    next();
  }, 80);
}

/** itemfinder.c ItemUseOnFieldCB_Itemfinder */
function useItemfinder(game: Game): void {
  const ow = game.overworld;
  const p = ow.player.object;
  const px = p.currentCoords.x, py = p.currentCoords.y;
  let found = false, itemX = 0, itemY = 0, underfoot: { flag: number; item: number } | null = null;
  for (const bg of ow.header.bgs) {
    if (bg.type !== "hidden_item" || flagGet(bg.flag)) continue;
    const dx = bg.x + 7 - px, dy = bg.y + 7 - py;
    if (bg.underfoot) {
      if (dx === 0 && dy === 0) { underfoot = { flag: bg.flag, item: bg.item }; break; }
    } else if (dx >= -7 && dx <= 7 && dy >= -5 && dy <= 5) {
      if (!found) { itemX = dx; itemY = dy; found = true; }
      else {
        const d2 = Math.abs(itemX) + Math.abs(itemY), d3 = Math.abs(dx) + Math.abs(dy);
        if (d2 > d3 || (d2 === d3 && (Math.abs(itemY) > Math.abs(dy) || (Math.abs(itemY) === Math.abs(dy) && itemY < dy)))) { itemX = dx; itemY = dy; }
      }
    }
  }
  const release = (): void => {
    ow.objects.clearHeldMovementIfFinished(p);
    ow.objects.unfreezeAll();
    ow.controlsLocked = false;
  };
  if (!found && !underfoot) { fieldMessage(game, rom.text("gText_NopeTheresNoResponse"), release); return; }
  let dings = underfoot ? 3 : itemX === 0 && itemY === 0 ? 4 : Math.max(Math.abs(itemX), Math.abs(itemY)) > 3 ? 2 : 4;
  let timer = 0;
  const id = tasks.create(() => {
    if (timer % 25 === 0) {
      if (dings === 0) {
        tasks.destroy(id);
        if (underfoot) {
          varSet(SV.x8004, underfoot.flag);
          varSet(SV.x8005, underfoot.item);
          varSet(SV.x8006, 1);
          fieldMessage(game, rom.text("gText_ItemfinderShakingWildly"), () => {
            ow.script.setupScript(rom.label("EventScript_ItemfinderDigUpUnderfootItem"));
          });
        } else {
          // Face the item as the arrows point (GetPlayerDirectionTowardsHiddenItem).
          const dir = Math.abs(itemX) > Math.abs(itemY) ? (itemX < 0 ? DIR_WEST : DIR_EAST) : (itemY < 0 ? DIR_NORTH : DIR_SOUTH);
          if (itemX || itemY) ow.objects.turn(p, dir);
          fieldMessage(game, rom.text("gText_ItemfinderResponding"), release);
        }
        return;
      }
      sound.playSE(C.SE_ITEMFINDER);
      dings--;
    }
    timer++;
  }, 80);
}

