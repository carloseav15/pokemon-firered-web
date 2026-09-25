// ShowPokemonSummaryScreen as a text adapter until pokemon_summary_screen.c
// is ported: the same three pages (info, skills, moves) as dialogue messages,
// then the caller's callback. Runs under gMain; L/R/UP/DOWN do not switch mons.

import { decode, encode } from "./gba/charmap";
import { openHardwareMessage } from "./menus/hardwareChoice";
import { rom } from "./rom";
import { playerMon, GetMonData, type Mon } from "./pokemon/mon";
import { itemName } from "./pokemon/items";
import { speciesName, nature } from "./pokemon/pokemon";
import * as C from "./generated/constants";

let sLastViewedMonIndex = 0;

export function GetLastViewedMonIndex(): number {
  return sLastViewedMonIndex;
}

function pages(mon: Mon): string[] {
  const name = decode(Uint8Array.from(mon.nickname));
  if (mon.isEgg) return [`${name}\nThis EGG is still\nwaiting to hatch.`];
  const types = rom.species[mon.species].types.map((t) => (rom as unknown as { typeNames?: string[] }).typeNames?.[t] ?? String(t));
  const item = mon.heldItem ? decode(itemName(mon.heldItem)) : "NONE";
  const natureName = (rom as unknown as { natures?: string[] }).natures?.[nature(mon)] ?? "";
  const s = mon.stats;
  const moves = mon.moves.map((m, i) => (m ? `${decode(rom.moveName(m))}  ${mon.pp[i]}` : "-"));
  return [
    `${name}  Lv${mon.level}\n${decode(speciesName(mon.species))}  ${types.join("/")}\nITEM ${item}  ${natureName}`,
    `HP ${mon.hp}/${s[0]}  ATTACK ${s[1]}\nDEFENSE ${s[2]}  SP.ATK ${s[4]}\nSP.DEF ${s[5]}  SPEED ${s[3]}`,
    `${moves[0]}\n${moves[1]}\n${moves[2]}\n${moves[3]}`,
  ];
}

/** ShowPokemonSummaryScreen(party, cursorPos, lastIdx, callback, mode) */
export function ShowPokemonSummaryScreen(cursorPos: number, _lastIdx: number, callback: () => void, _mode = 0): void {
  sLastViewedMonIndex = cursorPos;
  const mon = playerMon(cursorPos);
  if (GetMonData(mon, C.MON_DATA_SPECIES) === C.SPECIES_NONE) { callback(); return; }
  const list = pages(mon);
  const show = (i: number): void => {
    if (i >= list.length) { callback(); return; }
    openHardwareMessage(encode(list[i]), () => show(i + 1));
  };
  show(0);
}
