// wild_encounter.c: FireRed encounter selection, cooldown and rate RNG.
// Roamer state and fishing/Sweet Scent field animations are separate systems.
import type { Game } from "../game";
import * as C from "../generated/constants";
import { MetatileBehavior_IsBridge } from "../generated/metatileBehavior";
import { cdata, type SymRef } from "../hw/assets";
import { random, random32 } from "../random";
import { flagGet, incrementGameStat, save, varGet } from "../save";
import { ability, createMon, type Pokemon } from "../pokemon/pokemon";
import { roamerLevel, tryStartRoamerEncounter } from "../pokemon/roamer";

type Area = "landMonsInfo" | "waterMonsInfo" | "rockSmashMonsInfo" | "fishingMonsInfo";
type Header = { mapGroup: number; mapNum: number } & Record<Area, SymRef | 0>;
type Info = { encounterRate: number; wildPokemon: SymRef };
type WildMon = { minLevel: number; maxLevel: number; species: number };
const data = <T>(name: string) => cdata<T>("wild_encounter", name);
const LAND = [20, 40, 50, 60, 70, 80, 85, 90, 94, 98, 99, 100];
const WATER = [60, 90, 95, 99, 100];

export class WildEncounter {
  disabled = false;
  private rngState = 0;
  private previousBehavior = 0;
  private rateBuff = 0;
  private steps = 0;
  private abilityEffect = 0;
  private heldItem = 0;
  constructor(private game: Game) {}

  seed(value: number): void { this.rngState = value & 0xffff; this.resetEncounterRateModifiers(); }
  resetEncounterRateModifiers(): void { this.rateBuff = 0; this.steps = 0; }
  private encounterRandom(): number {
    this.rngState = (Math.imul(this.rngState, 1103515245) + 12345) >>> 0;
    return this.rngState >>> 16;
  }
  private header(): Header | undefined {
    const headers = data<Header[]>("gWildMonHeaders");
    let index = headers.findIndex(h => h.mapGroup === save.location.mapGroup && h.mapNum === save.location.mapNum);
    if (index < 0) return undefined;
    const map = (save.location.mapGroup << 8) | save.location.mapNum;
    if (map === C.MAP_SIX_ISLAND_ALTERING_CAVE) {
      const variant = varGet(C.VAR_ALTERING_CAVE_WILD_SET);
      index += variant < 9 ? variant : 0;
    }
    if (!flagGet(C.FLAG_SYS_UNLOCKED_TANOBY_RUINS) && map >= C.MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER && map <= C.MAP_SEVEN_ISLAND_TANOBY_RUINS_VIAPOIS_CHAMBER) return undefined;
    return headers[index];
  }
  private info(area: Area): Info | undefined {
    const ref = this.header()?.[area];
    return ref ? data<Info>(ref.$sym) : undefined;
  }
  private flute(): number {
    return flagGet(C.FLAG_SYS_WHITE_FLUTE_ACTIVE) ? 1 : flagGet(C.FLAG_SYS_BLACK_FLUTE_ACTIVE) ? 2 : 0;
  }
  private updateAbility(): void {
    const lead = save.party[0];
    const value = lead && !lead.isEgg ? ability(lead) : 0;
    this.abilityEffect = value === C.ABILITY_STENCH ? 1 : value === C.ABILITY_ILLUMINATE ? 2 : 0;
  }
  private allowedByRepel(level: number): boolean {
    if (!varGet(C.VAR_REPEL_STEP_COUNT)) return true;
    const lead = save.party.find(mon => mon.hp > 0 && !mon.isEgg);
    return !!lead && level >= lead.level;
  }
  private rateTest(base: number, ignoreAbility: boolean): boolean {
    let rate = base * 16;
    if (this.game.overworld.player.flags & (C.PLAYER_AVATAR_FLAG_MACH_BIKE | C.PLAYER_AVATAR_FLAG_ACRO_BIKE)) rate = Math.floor(rate * 80 / 100);
    rate += Math.floor(this.rateBuff * 16 / 200);
    if (this.flute() === 1) rate += Math.floor(rate / 2);
    else if (this.flute() === 2) rate = Math.floor(rate / 2);
    if (this.heldItem === C.ITEM_CLEANSE_TAG) rate = Math.floor(rate * 2 / 3);
    if (!ignoreAbility) {
      if (this.abilityEffect === 1) rate = Math.floor(rate / 2);
      else if (this.abilityEffect === 2) rate *= 2;
    }
    return this.encounterRandom() % 1600 < Math.min(1600, rate);
  }
  private cooldown(attributes: number): boolean {
    const type = (attributes >>> 24) & 7;
    const info = type === C.TILE_ENCOUNTER_LAND ? this.info("landMonsInfo") : type === C.TILE_ENCOUNTER_WATER ? this.info("waterMonsInfo") : undefined;
    if (!info) return false;
    let minSteps = (info.encounterRate >= 80 ? 0 : info.encounterRate < 10 ? 8 : 8 - Math.floor(info.encounterRate / 10)) * 256;
    let rate = 5 * 256;
    if (this.flute() === 1) { minSteps -= Math.floor(minSteps / 2); rate += Math.floor(rate / 2); }
    else if (this.flute() === 2) { minSteps *= 2; rate = Math.floor(rate / 2); }
    this.heldItem = save.party[0]?.heldItem ?? 0;
    if (this.heldItem === C.ITEM_CLEANSE_TAG) { minSteps += Math.floor(minSteps / 3); rate -= Math.floor(rate / 3); }
    this.updateAbility();
    if (this.abilityEffect === 1) { minSteps *= 2; rate = Math.floor(rate / 2); }
    else if (this.abilityEffect === 2) { minSteps = Math.floor(minSteps / 2); rate *= 2; }
    minSteps = Math.floor(minSteps / 256); rate = Math.floor(rate / 256);
    if (this.steps >= minSteps) return true;
    this.steps = (this.steps + 1) & 255;
    return random() % 100 < rate;
  }
  private addRateBuff(rate: number): void {
    this.rateBuff = varGet(C.VAR_REPEL_STEP_COUNT) ? 0 : (this.rateBuff + rate) & 0xffff;
  }
  private chooseSlot(thresholds: number[]): number {
    const value = random() % 100;
    return thresholds.findIndex(threshold => value < threshold);
  }
  private create(info: Info, slot: number, repel: boolean): Pokemon | null {
    const row = data<WildMon[]>(info.wildPokemon.$sym)[slot];
    const low = Math.min(row.minLevel, row.maxLevel), high = Math.max(row.minLevel, row.maxLevel);
    const level = low + random() % (high - low + 1);
    if (repel && !this.allowedByRepel(level)) return null;
    let personality: number;
    if (row.species === C.SPECIES_UNOWN) {
      const chamber = save.location.mapNum - (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER & 255);
      const letter = data<number[][]>("sUnownLetterSlots")[chamber][slot];
      do { personality = ((random() << 16) | random()) >>> 0; }
      while ((((personality & 0x3000000) >>> 18) | ((personality & 0x30000) >>> 12) | ((personality & 0x300) >>> 6) | (personality & 3)) % 28 !== letter);
    } else {
      const nature = random() % 25;
      do { personality = random32(); } while (personality % 25 !== nature);
    }
    return createMon(row.species, level, {personality, metLocation: this.game.overworld.header.regionMapSection});
  }
  private start(mon: Pokemon): void { this.game.battleSetup.startWildBattle(mon); }

  tryStandardWildEncounter(attributes: number): boolean {
    const previous = this.previousBehavior;
    const ready = this.cooldown(attributes);
    this.previousBehavior = attributes & 0x1ff;
    if (!ready || this.disabled) return false;
    const type = (attributes >>> 24) & 7;
    const water = type === C.TILE_ENCOUNTER_WATER || !!(this.game.overworld.player.flags & C.PLAYER_AVATAR_FLAG_SURFING) && MetatileBehavior_IsBridge(attributes & 0x1ff);
    const area = type === C.TILE_ENCOUNTER_LAND ? "landMonsInfo" : water ? "waterMonsInfo" : null;
    const info = area ? this.info(area) : undefined;
    if (!info) return false;
    if (previous !== this.previousBehavior && random() % 100 >= 60) return false;
    if (!this.rateTest(info.encounterRate, false)) { this.addRateBuff(info.encounterRate); return false; }
    const roamerMon = tryStartRoamerEncounter();
    if (roamerMon) {
      if (!this.allowedByRepel(roamerLevel())) return false;
      this.game.battleSetup.startRoamerBattle(roamerMon);
      return true;
    }
    const mon = this.create(info, this.chooseSlot(area === "landMonsInfo" ? LAND : WATER), true);
    if (!mon) { this.addRateBuff(info.encounterRate); return false; }
    this.resetEncounterRateModifiers(); this.start(mon); return true;
  }
  rockSmashEncounter(): boolean {
    const info = this.info("rockSmashMonsInfo");
    if (!info || !this.rateTest(info.encounterRate, true)) return false;
    const mon = this.create(info, this.chooseSlot(WATER), true);
    if (!mon) return false;
    this.start(mon); return true;
  }
  sweetScentEncounter(attributes: number): boolean {
    const type = (attributes >>> 24) & 7;
    if (type !== C.TILE_ENCOUNTER_LAND && type !== C.TILE_ENCOUNTER_WATER) return false;
    if (!this.header()) return false;
    const roamerMon = tryStartRoamerEncounter();
    if (roamerMon) {
      this.game.battleSetup.startRoamerBattle(roamerMon);
      return true;
    }
    const info = type === C.TILE_ENCOUNTER_LAND ? this.info("landMonsInfo") : this.info("waterMonsInfo");
    if (!info) return false;
    const mon = this.create(info, this.chooseSlot(type === C.TILE_ENCOUNTER_LAND ? LAND : WATER), false);
    if (!mon) return false;
    this.start(mon); return true;
  }
  hasFishingMons(): boolean { return !!this.info("fishingMonsInfo"); }
  fishingEncounter(rod: number): boolean {
    const info = this.info("fishingMonsInfo");
    if (!info || rod < 0 || rod > 2) return false;
    const slot = this.chooseSlot([[70, 100], [60, 80, 100], [40, 80, 95, 99, 100]][rod]) + [0, 2, 5][rod];
    const mon = this.create(info, slot, false);
    if (!mon) return false;
    incrementGameStat(C.GAME_STAT_FISHING_CAPTURES);
    this.start(mon); return true;
  }
}
