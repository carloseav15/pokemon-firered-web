// Emerald string-buffer dependencies: pokemon.c, lilycove_lady.c and item.c.
// C destination pointers are represented by fresh EOS-terminated arrays; the script command
// installs each result into the selected gStringVar, without aliasing ROM or another buffer.
import { b64, rom } from '@core/rom';
import { concat, encode } from '@core/gba/charmap';
import { itemName } from '@core/pokemon/items';
import * as C from './generated/constants';

/** pokemon.c: the parameter is a trainer ID, with TRAINER_NONE for IDs beyond the table. */
export function GetTrainerClassNameFromId(trainerId: number): Uint8Array {
  trainerId &= 0xffff;
  if (trainerId >= C.TRAINERS_COUNT) trainerId = C.TRAINER_NONE;
  return b64(rom.trainerClasses[rom.trainers[trainerId]!.class]!);
}

export function GetTrainerNameFromId(trainerId: number): Uint8Array {
  trainerId &= 0xffff;
  if (trainerId >= C.TRAINERS_COUNT) trainerId = C.TRAINER_NONE;
  return b64(rom.trainers[trainerId]!.name);
}

/** lilycove_lady.c: u8 parameter narrowing occurs after ScrCmd's u16 VarGet. */
export function BufferContestName(category: number): Uint8Array {
  return rom.text(rom.scriptMenu.contestNames![category & 0xff]!);
}

/** item.c: singular/plural suffixes come from Emerald text, including ENIGMA (last berry). */
export function GetBerryCountString(berryName: Uint8Array, quantity: number): Uint8Array {
  return concat(berryName, encode(' '), rom.text(quantity < 2 ? 'gText_Berry' : 'gText_Berries'));
}

export function CopyItemNameHandlePlural(itemId: number, quantity: number): Uint8Array {
  itemId &= 0xffff;
  quantity >>>= 0;
  if (itemId === C.ITEM_POKE_BALL) return quantity < 2 ? itemName(C.ITEM_POKE_BALL) : rom.text('gText_PokeBalls');
  if (itemId >= C.FIRST_BERRY_INDEX && itemId <= C.LAST_BERRY_INDEX)
    return GetBerryCountString(b64(rom.scriptMenu.berryNames![itemId - C.FIRST_BERRY_INDEX]!), quantity);
  return itemName(itemId);
}
