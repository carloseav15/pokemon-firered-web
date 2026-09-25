// pokedex_screen.c: the Pokédex list and info page as a field-menu adapter.
// Seen/caught flags, Kanto vs National ordering, category/height/weight
// formatting and cries follow the source; search modes, area pages, mon pics,
// footprints and the list graphics remain pending.

import { decode, encode } from "../gba/charmap";
import { b64, rom } from "../rom";
import { flagGet, varGet } from "../save";
import { dexCount, getDexFlag, nationalDexNum, speciesName } from "../pokemon/pokemon";
import { sound } from "../audio/sound";
import { openHardwareChoice, openHardwareMessage } from "./hardwareChoice";

export const KANTO_DEX_COUNT = 151;
export const NATIONAL_DEX_COUNT = 386;

/** IsNationalPokedexEnabled (mirrors script/specials to avoid a cycle). */
export function isNationalDexEnabled(): boolean {
  return varGet(rom.c("VAR_NATIONAL_DEX")) === 0x6258 && flagGet(rom.c("FLAG_SYS_NATIONAL_DEX"));
}

export function dexLimit(): number {
  return isNationalDexEnabled() ? NATIONAL_DEX_COUNT : KANTO_DEX_COUNT;
}

type DexEntry = {
  height: number;
  weight: number;
  category: string;
  description: string;
};

function entry(national: number): DexEntry | undefined {
  return rom.pokedex[national] as DexEntry | undefined;
}

const b64text = (value: string): string =>
  decode(Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0)));

/** NationalPokedexNumToSpecies: first species with that national number. */
const nationalMap = new Map<number, number>();
export function nationalToSpecies(national: number): number {
  const cached = nationalMap.get(national);
  if (cached !== undefined) return cached;
  for (let species = 1; species < rom.species.length; species++) {
    if (nationalDexNum(species) === national) {
      nationalMap.set(national, species);
      return species;
    }
  }
  nationalMap.set(national, 0);
  return 0;
}

/** DexScreen_PrintMonHeight: decimeters to feet/inches. */
export function formatHeight(heightDm: number, caught: boolean): string {
  if (!caught) return `??'??"`;
  let inches10 = Math.floor((10000 * heightDm) / 254);
  if (inches10 % 10 >= 5) inches10 += 10;
  const feet = Math.floor(inches10 / 120);
  const inches = Math.floor((inches10 - feet * 120) / 10);
  return `${feet}'${String(inches).padStart(2, "0")}"`;
}

/** DexScreen_PrintMonWeight: hectograms to pounds. */
export function formatWeight(weightHg: number, caught: boolean): string {
  if (!caught) return "??.? lbs.";
  let lbs100 = Math.floor((weightHg * 100000) / 4536);
  if (lbs100 % 10 >= 5) lbs100 += 10;
  return `${Math.floor(lbs100 / 100)}.${Math.floor((lbs100 % 100) / 10)} lbs.`;
}

/** DexScreen_PrintMonCategory: first word (11 chars) + POKéMON, ??? if unseen. */
export function formatCategory(national: number, caught: boolean): string {
  const suffix = decode(rom.text("gText_PokedexPokemon"));
  if (!caught) return `???????????${suffix}`;
  const raw = b64text(entry(national)?.category ?? "");
  return `${raw.split(" ")[0]?.slice(0, 11) ?? ""}${suffix}`;
}

/** The dex info page text (number, name, category, HT/WT, flavor). */
export function dexInfoMessage(species: number): Uint8Array {
  const national = nationalDexNum(species);
  const caught = getDexFlag(national, true);
  const data = entry(national);
  const num = String(national).padStart(3, "0");
  const name = caught || getDexFlag(national, false) ? decode(speciesName(species)) : "------";
  const flavor = caught && data ? b64text(data.description) : "";
  return encode(
    [`No.${num} ${name}`, formatCategory(national, caught),
     `HT ${formatHeight(data?.height ?? 0, caught)} WT ${formatWeight(data?.weight ?? 0, caught)}`,
     flavor].filter((line) => line !== "").join("\n"),
  );
}

function rowLabel(national: number): { label: string; disabled: boolean } {
  const num = String(national).padStart(3, "0");
  const caught = getDexFlag(national, true);
  const seen = caught || getDexFlag(national, false);
  if (!seen) return { label: `${num} ------`, disabled: true };
  return { label: `${num} ${caught ? "*" : ""}${decode(speciesName(nationalToSpecies(national)))}`, disabled: false };
}

/** CB2_OpenPokedexFromStartMenu: numerical list, detail page, cry. */
export function openPokedexScreen(done: () => void): void {
  const national = isNationalDexEnabled();
  const limit = national ? NATIONAL_DEX_COUNT : KANTO_DEX_COUNT;
  const list = (): void => {
    const rows: Array<{ label: string; value: number; disabled?: boolean }> = [
      { label: `SEEN ${dexCount(false, !national)} CAUGHT ${dexCount(true, !national)}`, value: -1, disabled: true },
    ];
    for (let n = 1; n <= limit; n++) {
      const row = rowLabel(n);
      rows.push({ label: row.label, value: n, disabled: row.disabled });
    }
    openHardwareChoice("POKéDEX", rows, true, (n) => {
      if (n === null || n < 1) { done(); return; }
      const species = nationalToSpecies(n);
      sound.playCry(species, 0);
      openHardwareMessage(dexInfoMessage(species), list);
    });
  };
  list();
}
