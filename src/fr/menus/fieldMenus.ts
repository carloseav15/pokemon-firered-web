// Field bag/party adapters. Rules reuse item.c/pokemon.c ports; dedicated
// source menu graphics, mail editing and field-move interfaces remain pending.
import type { Game } from "../game";
import { HwScene } from "../hw/runtime";
import { openHardwareChoice } from "./hardwareChoice";
import { decode } from "../gba/charmap";
import { b64, rom } from "../rom";
import { flagClear, flagSet, save, varGet, varSet } from "../save";
import { itemInfo, itemName, pocketList, removeBagItem } from "../pokemon/items";
import { PokemonUseItemEffects } from "../battle/ext";
import type { Mon } from "../pokemon/mon";
import * as C from "../generated/constants";
import { sound } from "../audio/sound";

function fieldMenu(game: Game, begin: (close: () => void) => void): void {
  const scene = new HwScene(); scene.enter(); game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  begin(() => {
    scene.leave(); game.scene = null;
    game.setCallbacks(() => game.overworld.cb1(), () => game.overworld.cb2());
    game.closeStartMenu();
  });
}

export function openFieldParty(game: Game): void {
  fieldMenu(game, close => {
    const party = (): void => openHardwareChoice("POKéMON", save.party.map((mon, index) => ({
      label: `${decode(mon.nickname)} Lv${mon.level} ${mon.hp}/${mon.stats[0]}`, value: index,
    })), true, index => { if (index === null) close(); else actions(index); });
    const actions = (index: number): void => openHardwareChoice(decode(save.party[index].nickname), [
      {label: "SUMMARY", value: 0}, {label: "SWITCH", value: 1},
    ], true, selected => {
      if (selected === null) { party(); return; }
      if (selected === 1) {
        openHardwareChoice("Move to which position?", save.party.map((mon, value) => ({label: decode(mon.nickname), value})), true, other => {
          if (other !== null) [save.party[index], save.party[other]] = [save.party[other], save.party[index]];
          party();
        });
      } else {
        const mon = save.party[index];
        const labels = mon.isEgg ? ["EGG", `OT ${decode(mon.otName)}`] : [
          `Lv${mon.level} EXP ${mon.exp}`, `HP ${mon.hp}/${mon.stats[0]}`, `ATTACK ${mon.stats[1]} DEFENSE ${mon.stats[2]}`,
          `SP. ATK ${mon.stats[4]} SP. DEF ${mon.stats[5]}`, `SPEED ${mon.stats[3]}`, ...mon.moves.filter(Boolean).map(move => decode(b64(rom.moves[move].name))),
        ];
        openHardwareChoice(decode(mon.nickname), labels.map((label, value) => ({label, value})), true, () => actions(index));
      }
    });
    party();
  });
}

export function openFieldBag(game: Game, initialItem?: number): void {
  fieldMenu(game, close => {
    const message = (title: string, next: () => void = bag): void => openHardwareChoice(title, [{label: "OK", value: 0}], false, next);
    const apply = (item: number, index: number, move: number): void => {
      if (PokemonUseItemEffects(save.party[index] as Mon, item, index, move, false)) { message("It won't have any effect."); return; }
      removeBagItem(item, 1); sound.playSE(C.SE_USE_ITEM); message("The item was used.");
    };
    const medicine = (item: number): void => openHardwareChoice("Use on which POKéMON?", save.party.map((mon, value) => ({label: decode(mon.nickname), value, disabled: mon.isEgg})), true, index => {
      if (index === null) { bag(); return; }
      const info = itemInfo(item)!;
      const effect = rom.itemEffects[item - C.ITEM_POTION];
      const moveNeeded = info.fieldUseFunc === "FieldUseFunc_PpUp" || info.fieldUseFunc === "FieldUseFunc_Ether" && !!((effect?.[4] ?? 0) & C.ITEM4_HEAL_PP_ONE);
      if (!moveNeeded) { apply(item, index, 0); return; }
      const mon = save.party[index];
      openHardwareChoice("Choose a move.", mon.moves.map((id, value) => ({value, disabled: !id, label: id ? `${decode(b64(rom.moves[id].name))} PP ${mon.pp[value]}` : "-"})), true, slot => {
        if (slot === null) medicine(item); else apply(item, index, slot);
      });
    });
    const use = (item: number): void => {
      const info = itemInfo(item)!;
      switch (info.fieldUseFunc) {
        case "FieldUseFunc_Medicine": case "FieldUseFunc_Ether": case "FieldUseFunc_PpUp": medicine(item); return;
        case "FieldUseFunc_Repel":
          if (varGet(C.VAR_REPEL_STEP_COUNT)) { message("The REPEL's effect still lingers."); return; }
          if (removeBagItem(item, 1)) { varSet(C.VAR_REPEL_STEP_COUNT, info.holdEffectParam); sound.playSE(C.SE_REPEL); }
          message("The REPEL was used."); return;
        case "FieldUseFunc_BlackWhiteFlute": {
          const white = item === C.ITEM_WHITE_FLUTE;
          flagSet(white ? C.FLAG_SYS_WHITE_FLUTE_ACTIVE : C.FLAG_SYS_BLACK_FLUTE_ACTIVE);
          flagClear(white ? C.FLAG_SYS_BLACK_FLUTE_ACTIVE : C.FLAG_SYS_WHITE_FLUTE_ACTIVE);
          sound.playSE(C.SE_GLASS_FLUTE); message(white ? "Wild POKéMON will be lured." : "Wild POKéMON will be repelled."); return;
        }
        case "FieldUseFunc_PokeFlute":
          save.party.forEach((mon, i) => { if (!mon.isEgg) PokemonUseItemEffects(mon as Mon, C.ITEM_AWAKENING, i, 0, false); });
          message("Played the POKé FLUTE."); return;
        case "FieldUseFunc_CoinCase": message(`COINS: ${save.coins}`); return;
        case "FieldUseFunc_TmCase": pocket(4); return;
        case "FieldUseFunc_BerryPouch": pocket(5); return;
        default: message("Can't use that here."); return;
      }
    };
    const actions = (item: number): void => {
      const info = itemInfo(item)!;
      const choices = [{label: "USE", value: 0}];
      if (!info.importance) choices.push({label: "TOSS", value: 1});
      if (info.registrability) choices.push({label: save.registeredItem === item ? "DESELECT" : "REGISTER", value: 2});
      openHardwareChoice(decode(itemName(item)), choices, true, choice => {
        if (choice === null) { bag(); return; }
        if (choice === 0) { use(item); return; }
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
      if (selected === null) close(); else pocket(selected);
    });
    if (initialItem !== undefined) use(initialItem); else bag();
  });
}
