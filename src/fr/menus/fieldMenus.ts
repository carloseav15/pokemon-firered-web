// Field bag/party adapters. Rules reuse item.c/pokemon.c ports; dedicated
// source menu graphics, mail editing and field-move interfaces remain pending.
import type { Game } from "../game";
import { HwScene } from "../hw/runtime";
import { openHardwareChoice } from "./hardwareChoice";
import { decode } from "../gba/charmap";
import { b64, rom } from "../rom";
import { flagClear, flagSet, save, varGet, varSet } from "../save";
import { addBagItem, itemInfo, itemName, pocketList, removeBagItem } from "../pokemon/items";
import { fieldMoveName, fieldMovesOf, flyDestinations, text, trySetUpFieldMove } from "./fieldMoveMenu";
import { encode, stringVars } from "../gba/charmap";
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
import { learnLevelUpMoves, evolveWithMessages, learnMoveWithPrompt, tmhmMove } from "./monProgress";
import { canLearnTMHM, itemEvolution, levelUpEvolution } from "../pokemon/pokemon";
import { flagGet, incrementGameStat, SV } from "../save";
import { itemPocket } from "../pokemon/items";


export function fieldMenu(game: Game, begin: (close: () => void) => void, closeStartMenu = true): void {
  const scene = new HwScene(); scene.enter(); game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  begin(() => {
    scene.leave(); game.scene = null;
    game.setCallbacks(() => game.overworld.cb1(), () => game.overworld.cb2());
    if (closeStartMenu) game.closeStartMenu();
  });
}

export function openFieldParty(game: Game): void {
  let post: (() => void) | null = null;
  fieldMenu(game, close => {
    const finish = (): void => { close(); const cb = post; post = null; cb?.(); };
    const message = (title: string, next: () => void): void => openHardwareChoice(title, [{label: "OK", value: 0}], false, next);
    const party = (): void => openHardwareChoice(text("gText_ChoosePokemon"), save.party.map((mon, index) => ({
      label: `${decode(mon.nickname)} Lv${mon.level} ${mon.hp}/${mon.stats[0]}`, value: index,
    })), true, index => { if (index === null) finish(); else actions(index); });
    const actions = (index: number): void => {
      const mon = save.party[index];
      const moves = mon.isEgg ? [] : fieldMovesOf(mon.moves);
      const choices = [
        ...moves.map(fieldMove => ({label: fieldMoveName(fieldMove), value: 100 + fieldMove})),
        {label: "SUMMARY", value: 0}, {label: "SWITCH", value: 1}, ...(mon.isEgg ? [] : [{label: "ITEM", value: 2}]),
      ];
      stringVars.var1 = Uint8Array.from(mon.nickname);
      openHardwareChoice(text("gText_DoWhatWithPokemon"), choices, true, selected => {
        if (selected === null) { party(); return; }
        if (selected >= 100) { fieldMove(index, selected - 100); return; }
        if (selected === 1) {
          openHardwareChoice(text("gText_MoveToWhere"), save.party.map((m, value) => ({label: decode(m.nickname), value})), true, other => {
            if (other !== null) [save.party[index], save.party[other]] = [save.party[other], save.party[index]];
            party();
          });
        } else if (selected === 2) {
          itemMenu(index);
        } else {
          const labels = mon.isEgg ? ["EGG", `OT ${decode(mon.otName)}`] : [
            `Lv${mon.level} EXP ${mon.exp}`, `HP ${mon.hp}/${mon.stats[0]}`, `ATTACK ${mon.stats[1]} DEFENSE ${mon.stats[2]}`,
            `SP. ATK ${mon.stats[4]} SP. DEF ${mon.stats[5]}`, `SPEED ${mon.stats[3]}`,
            `ITEM ${mon.heldItem ? decode(itemName(mon.heldItem)) : "NONE"}`,
            ...mon.moves.filter(Boolean).map((move, slot) => `${decode(b64(rom.moves[move].name))} ${mon.pp[slot]}`),
          ];
          openHardwareChoice(decode(mon.nickname), labels.map((label, value) => ({label, value})), true, () => actions(index));
        }
      });
    };
    const itemMenu = (index: number): void => {
      const mon = save.party[index];
      openHardwareChoice(text("gText_DoWhatWithItem"), [{label: "GIVE", value: 0}, {label: "TAKE", value: 1}], true, choice => {
        if (choice === null) { actions(index); return; }
        if (choice === 1) {
          if (!mon.heldItem) { message(`${decode(mon.nickname)} isn't holding anything.`, () => actions(index)); return; }
          if (!addBagItem(mon.heldItem, 1)) { message(text("gText_BagFullCouldNotRemoveItem"), () => actions(index)); return; }
          const taken = mon.heldItem;
          mon.heldItem = 0;
          message(`Received the ${decode(itemName(taken))} from ${decode(mon.nickname)}.`, party);
          return;
        }
        const items = [1, 3, 4, 5].flatMap(p => pocketList(p)).map(slot => ({label: `${decode(itemName(slot.item))} x${slot.quantity}`, value: slot.item}));
        openHardwareChoice(text("gText_GiveToWhichPokemon"), items, true, item => {
          if (item === null) { itemMenu(index); return; }
          removeBagItem(item, 1);
          if (mon.heldItem) addBagItem(mon.heldItem, 1);
          mon.heldItem = item;
          message(`${decode(mon.nickname)} was given the ${decode(itemName(item))} to hold.`, party);
        });
      });
    };
    const fieldMove = (index: number, move: number): void => {
      const result = trySetUpFieldMove(game, move, index);
      switch (result.kind) {
        case "fail": message(result.message, party); return;
        case "close": post = result.post; finish(); return;
        case "confirm":
          openHardwareChoice(result.message, [{label: "YES", value: 1}, {label: "NO", value: 0}], true, yes => {
            if (yes === 1) { post = result.post; finish(); } else party();
          });
          return;
        case "fly": {
          const destinations = flyDestinations();
          openHardwareChoice("Where to fly?", destinations.map((d, value) => ({label: d.name, value})), true, choice => {
            if (choice === null) { party(); return; }
            const dest = destinations[choice];
            post = () => {
              game.overworld.setWarpDestinationToHealLocation(dest.heal);
              game.fieldEffectArguments[0] = index;
              game.overworld.effects.moves.startFly();
            };
            finish();
          });
          return;
        }
        case "softboiled":
          openHardwareChoice(text("gText_UseOnWhichPokemon"), save.party.map((m, value) => ({label: `${decode(m.nickname)} ${m.hp}/${m.stats[0]}`, value})), true, target => {
            if (target === null) { party(); return; }
            const user = save.party[index], recipient = save.party[target];
            if (recipient.hp === 0 || target === index || recipient.hp === recipient.stats[0] || recipient.isEgg) {
              message(text("gText_CantBeUsedOnPkmn"), party);
              return;
            }
            const amount = Math.floor(user.stats[0] / 5);
            sound.playSE(C.SE_USE_ITEM);
            user.hp = Math.max(0, user.hp - amount);
            const before = recipient.hp;
            recipient.hp = Math.min(recipient.stats[0], recipient.hp + amount);
            stringVars.var1 = Uint8Array.from(recipient.nickname);
            stringVars.var2 = encode(String(recipient.hp - before));
            message(text("gText_PkmnHPRestoredByVar2"), party);
          });
          return;
      }
    };
    party();
  });
}

export function openFieldBag(game: Game, initialItem?: number): void {
  let post: (() => void) | null = null;
  fieldMenu(game, close => {
    const finish = (): void => { close(); const cb = post; post = null; cb?.(); };
    const onField = (cb: () => void): void => {
      post = () => { game.overworld.controlsLocked = true; game.overworld.objects.freezeAll(); cb(); };
      finish();
    };
    const message = (title: string | ArrayLike<number>, next: () => void = bag): void => {
      if (typeof title === "string") openHardwareChoice(title, [{label: "OK", value: 0}], false, next);
      else openHardwareMessage(title, next);
    };
    const notNow = (next: () => void = bag): void => {
      stringVars.var1 = Uint8Array.from(save.playerName);
      message(rom.text("gText_OakForbidsUseOfItemHere"), next);
    };
    const chooseMon = (title: ArrayLike<number>, next: (index: number) => void, back: () => void): void =>
      openHardwareChoice(title, save.party.map((mon, value) => ({label: `${decode(mon.nickname)} Lv${mon.level} ${mon.hp}/${mon.stats[0]}`, value})), true,
        index => { if (index === null) back(); else next(index); });
    const apply = (item: number, index: number, move: number): void => {
      if (PokemonUseItemEffects(save.party[index] as Mon, item, index, move, false)) { message(rom.text("gText_WontHaveEffect")); return; }
      removeBagItem(item, 1); sound.playSE(C.SE_USE_ITEM); message("The item was used.");
    };
    const medicine = (item: number): void => chooseMon(rom.text("gText_UseOnWhichPokemon"), index => {
      const info = itemInfo(item)!;
      const effect = rom.itemEffects[item - C.ITEM_POTION];
      const moveNeeded = info.fieldUseFunc === "FieldUseFunc_PpUp" || info.fieldUseFunc === "FieldUseFunc_Ether" && !!((effect?.[4] ?? 0) & C.ITEM4_HEAL_PP_ONE);
      if (save.party[index].isEgg) { message(rom.text("gText_WontHaveEffect")); return; }
      if (!moveNeeded) { apply(item, index, 0); return; }
      const mon = save.party[index];
      openHardwareChoice(rom.text(info.fieldUseFunc === "FieldUseFunc_PpUp" ? "gText_BoostPp" : "gText_RestoreWhichMove"), mon.moves.map((id, value) => ({value, disabled: !id, label: id ? `${decode(rom.moveName(id))} PP ${mon.pp[value]}` : "-"})), true, slot => {
        if (slot === null) medicine(item); else apply(item, index, slot);
      });
    }, bag);
    /** ItemUseCB_RareCandy → level-up stats, new moves, evolution */
    const rareCandy = (item: number): void => chooseMon(rom.text("gText_UseOnWhichPokemon"), index => {
      const mon = save.party[index];
      if (mon.isEgg || mon.level >= 100 || PokemonUseItemEffects(mon as Mon, item, index, 0, true)) { message(rom.text("gText_WontHaveEffect")); return; }
      const before = [...mon.stats];
      PokemonUseItemEffects(mon as Mon, item, index, 0, false);
      removeBagItem(item, 1);
      sound.playFanfare(C.MUS_LEVEL_UP);
      stringVars.var1 = Uint8Array.from(mon.nickname);
      stringVars.var2 = encode(String(mon.level));
      message(rom.text("gText_PkmnElevatedToLvVar2"), () => {
        const names = ["MAX. HP", "ATTACK", "DEFENSE", "SPEED", "SP. ATK", "SP. DEF"];
        const order = [0, 1, 2, 4, 5, 3];
        openHardwareChoice(decode(mon.nickname), order.map((i, value) => ({label: `${names[i]}  +${mon.stats[i] - before[i]}  ${mon.stats[i]}`, value})), false, () => {
          learnLevelUpMoves(mon, () => {
            const target = levelUpEvolution(mon);
            if (target && mon.heldItem !== C.ITEM_EVERSTONE) evolveWithMessages(mon, target, bag);
            else bag();
          });
        });
      });
    }, bag);
    /** ItemUseCB_EvolutionStone */
    const evolutionStone = (item: number): void => chooseMon(rom.text("gText_UseOnWhichPokemon"), index => {
      const mon = save.party[index];
      const target = mon.isEgg ? 0 : itemEvolution(mon, item);
      if (!target) { message(rom.text("gText_WontHaveEffect")); return; }
      removeBagItem(item, 1);
      evolveWithMessages(mon, target, bag);
    }, bag);
    /** ItemUseCB_SacredAsh: revives every fainted party member */
    const sacredAsh = (item: number): void => {
      let used = false;
      save.party.forEach((mon, i) => { if (!mon.isEgg && !PokemonUseItemEffects(mon as Mon, item, i, 0, false)) used = true; });
      if (!used) { message(rom.text("gText_WontHaveEffect")); return; }
      removeBagItem(item, 1);
      sound.playSE(C.SE_USE_ITEM);
      message("All fainted POKéMON were revived.");
    };
    /** tm_case.c UseTM → party_menu.c ItemUseCB_TMHM */
    const useTM = (item: number): void => {
      const move = tmhmMove(item);
      stringVars.var2 = rom.moveName(move);
      message(rom.text(item >= C.ITEM_HM01 ? "gText_BootedUpHM" : "gText_BootedUpTM"), () => {
        openHardwareChoice(rom.text("gText_TeachWhichPokemon"), save.party.map((mon, value) => {
          const able = !mon.isEgg && canLearnTMHM(mon.species, item - C.ITEM_TM01);
          const knows = mon.moves.includes(move);
          return {label: `${decode(mon.nickname)}  ${mon.isEgg ? "" : knows ? "LEARNED" : able ? "ABLE" : "NOT ABLE"}`, value};
        }), true, index => {
          if (index === null) { tmCase(); return; }
          const mon = save.party[index];
          stringVars.var1 = Uint8Array.from(mon.nickname);
          stringVars.var2 = rom.moveName(move);
          if (mon.isEgg || !canLearnTMHM(mon.species, item - C.ITEM_TM01)) { message(rom.text("gText_PkmnCantLearnMove"), tmCase); return; }
          if (mon.moves.includes(move)) { message(rom.text("gText_PkmnAlreadyKnows"), tmCase); return; }
          learnMoveWithPrompt(mon, move, learned => {
            if (learned && item < C.ITEM_HM01) removeBagItem(item, 1);
            tmCase();
          });
        });
      });
    };
    const tmCase = (): void => openHardwareChoice("TM CASE", pocketList(4).map(slot => ({
      label: `${slot.item >= C.ITEM_HM01 ? "HM" : "TM"}${String(slot.item >= C.ITEM_HM01 ? slot.item - C.ITEM_HM01 + 1 : slot.item - C.ITEM_TM01 + 1).padStart(2, "0")} ${decode(rom.moveName(tmhmMove(slot.item)))}${slot.item >= C.ITEM_HM01 ? "" : ` x${slot.quantity}`}`,
      value: slot.item,
    })), true, item => {
      if (item === null) { bag(); return; }
      openHardwareChoice(decode(itemName(item)), [{label: "USE", value: 0}, ...(item < C.ITEM_HM01 ? [{label: "GIVE", value: 1}] : [])], true, choice => {
        if (choice === null) { tmCase(); return; }
        if (choice === 0) useTM(item);
        else giveItem(item, tmCase);
      });
    });
    const giveItem = (item: number, back: () => void): void => chooseMon(rom.text("gText_GiveToWhichPokemon"), index => {
      const mon = save.party[index];
      if (mon.isEgg) { message("An EGG can't hold an item.", back); return; }
      removeBagItem(item, 1);
      const previous = mon.heldItem;
      mon.heldItem = item;
      if (previous) addBagItem(previous, 1);
      message(`${decode(mon.nickname)} was given the ${decode(itemName(item))} to hold.`, back);
    }, back);
    const use = (item: number): void => {
      const info = itemInfo(item)!;
      const ow = game.overworld;
      switch (info.fieldUseFunc) {
        case "FieldUseFunc_Medicine": case "FieldUseFunc_Ether": case "FieldUseFunc_PpUp": medicine(item); return;
        case "FieldUseFunc_RareCandy": rareCandy(item); return;
        case "FieldUseFunc_EvoItem": evolutionStone(item); return;
        case "FieldUseFunc_SacredAsh": sacredAsh(item); return;
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
        case "FieldUseFunc_CoinCase": stringVars.var1 = encode(String(save.coins)); message(rom.text("gText_CoinCase")); return;
        case "FieldUseFunc_PowderJar": stringVars.var1 = encode(String(save.berryPowder ?? 0)); message(rom.text("gText_PowderQty")); return;
        case "FieldUseFunc_TmCase": tmCase(); return;
        case "FieldUseFunc_BerryPouch": pocket(5); return;
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
        case "FieldUseFunc_TownMap": onField(() => game.showTownMapFromField()); return;
        case "FieldUseFunc_FameChecker": onField(() => game.openFameChecker()); return;
        case "FieldUseFunc_TeachyTv": onField(() => game.openTeachyTv()); return;
        case "FieldUseFunc_VsSeeker": onField(() => game.useVsSeeker()); return;
        case "FieldUseFunc_Mail": message(rom.text("gText_WontHaveEffect")); return;
        case "ItemUseOutOfBattle_EnigmaBerry": medicine(item); return;
        default: notNow(); return;
      }
    };
    const actions = (item: number): void => {
      const info = itemInfo(item)!;
      const pocketId = itemPocket(item);
      const choices = [{label: "USE", value: 0}];
      if (pocketId !== 2 && !info.importance) choices.push({label: "GIVE", value: 3});
      if (!info.importance) choices.push({label: "TOSS", value: 1});
      if (info.registrability) choices.push({label: save.registeredItem === item ? "DESELECT" : "REGISTER", value: 2});
      openHardwareChoice(decode(itemName(item)), choices, true, choice => {
        if (choice === null) { bag(); return; }
        if (choice === 0) { use(item); return; }
        if (choice === 3) { giveItem(item, bag); return; }
        if (choice === 2) { save.registeredItem = save.registeredItem === item ? 0 : item; bag(); return; }
        openHardwareChoice("Throw away one item?", [{label: "NO", value: 0}, {label: "YES", value: 1}], true, answer => {
          if (answer === 1) removeBagItem(item, 1);
          bag();
        });
      });
    };
    const pocket = (id: number): void => openHardwareChoice(["", "ITEMS", "KEY ITEMS", "POKé BALLS", "TM CASE", "BERRY POUCH"][id], pocketList(id).map(slot => ({label: `${decode(itemName(slot.item))} x${slot.quantity}`, value: slot.item})), true, item => {
      if (item === null) bag(); else actions(item);
    });
    const bag = (): void => openHardwareChoice("BAG", [{label: "ITEMS", value: 1}, {label: "KEY ITEMS", value: 2}, {label: "POKé BALLS", value: 3}], true, selected => {
      if (selected === null) finish(); else pocket(selected);
    });
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

