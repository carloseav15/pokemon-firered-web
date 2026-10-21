import { sound } from "@core/audio/sound";
import { createM4aBackend } from "@core/audio/m4a";
import { GetLocalWildMon } from "@core/field/wildEncounter";
import { random } from "@core/random";
import * as C from "../../games/firered/generated/constants";
import { resolveJohtoMusic } from "./johtoMusic";
import { getJohtoWildMon } from "./johtoWildMons";

export class ViewerAudioController {
  private initialized = false;
  private currentMapId: string | null = null;
  private currentMapMusicId: number | null = null;
  private currentMusicId: number | null = null;
  private enabled = false;
  lastError: string | null = null;

  // Ambient wild cries (overworld.c: sAmbientCrySpecies, sIsAmbientCryWaterMon, UpdateAmbientCry)
  private ambientCrySpecies: number = C.SPECIES_NONE;
  private ambientCryIsWaterMon: boolean = false;
  private ambientCryState: number = 0;
  private ambientCryDelay: number = 0;
  private playerIsOnWater: boolean = false;
  private isHoenn = false;
  private isJohto = false;

  constructor() {}

  setHoenn(hoenn: boolean): void {
    this.isHoenn = hoenn;
  }

  setJohto(johto: boolean): void {
    this.isJohto = johto;
  }

  init(): boolean {
    if (this.initialized) return true;
    try {
      sound.init(C);
      sound.m4aSoundInit(createM4aBackend());
      this.initialized = true;
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = `Audio del viewer: ${String(error)}`;
      return false;
    }
  }

  enable(): void {
    this.enabled = this.init();
    if (this.currentMusicId) {
      this.playMapMusic(this.currentMusicId);
    }
  }

  disable(): void {
    this.enabled = false;
    sound.stopMapMusic();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** overworld.c:1188-1191 ChooseAmbientCrySpecies */
  chooseAmbientCry(mapId: string, isOutdoors: boolean): void {
    if (!isOutdoors) {
      this.ambientCrySpecies = C.SPECIES_NONE;
      this.ambientCryState = 4;
      return;
    }
    const isWater = { value: false };
    const species = this.isJohto ? getJohtoWildMon(mapId, isWater) : GetLocalWildMon(isWater);
    this.ambientCrySpecies = species;
    this.ambientCryIsWaterMon = isWater.value;
    this.ambientCryState = species === C.SPECIES_NONE ? 4 : 1;
    this.ambientCryDelay = 0;
  }

  setPlayerOnWater(onWater: boolean): void {
    this.playerIsOnWater = onWater;
  }

  /**
   * Updates map BGM and checks whether vehicle (bike / surf) overrides map music.
   * overworld.c:1037-1046, overworld.c:1193-1201
   */
  updateMap(mapId: string, defaultMusicId?: number | string, vehicle?: "walk" | "bike" | "surf", canOverride: boolean = true): void {
    const mapChanged = this.currentMapId !== mapId;
    this.currentMapId = mapId;

    let targetMusicId: number;
    if (typeof defaultMusicId === "string") {
      targetMusicId = resolveJohtoMusic(defaultMusicId);
    } else if (typeof defaultMusicId === "number" && defaultMusicId > 0) {
      targetMusicId = defaultMusicId;
    } else {
      targetMusicId = this.currentMapMusicId ?? (this.isHoenn ? 405 : C.MUS_PALLET);
    }
    this.currentMapMusicId = targetMusicId;

    let targetMusic = this.currentMapMusicId;
    if (canOverride) {
      if (vehicle === "surf") {
        targetMusic = this.isHoenn ? 365 : C.MUS_SURF;
      } else if (vehicle === "bike") {
        targetMusic = this.isHoenn ? 403 : C.MUS_CYCLING;
      }
    }

    if (mapChanged || this.currentMusicId !== targetMusic) {
      this.currentMusicId = targetMusic;
      if (this.enabled) {
        this.playMapMusic(targetMusic);
      }
    }
  }

  private playMapMusic(songId: number): void {
    if (!this.enabled) return;
    this.init();
    if (songId > 0 && sound.getCurrentMapMusic() !== songId) {
      sound.fadeOutAndPlayNewMapMusic(songId, 6);
    }
  }

  playBGM(songId: number): void {
    if (!this.enabled) return;
    this.init();
    if (songId > 0 && sound.getCurrentMapMusic() !== songId) {
      sound.fadeOutAndPlayNewMapMusic(songId, 6);
    }
  }

  playSE(seId: number): void {
    if (!this.enabled) return;
    this.init();
    sound.playSE(seId);
  }

  playWallBump(): void {
    this.playSE(C.SE_WALL_HIT ?? 7);
  }

  playLedgeJump(): void {
    this.playSE(C.SE_LEDGE ?? 10);
  }

  playBikeBell(): void {
    this.playSE(C.SE_BIKE_BELL ?? 11);
  }

  playExclamation(): void {
    this.playSE(C.SE_PIN ?? 21);
  }

  playSelect(): void {
    this.playSE(C.SE_SELECT ?? 5);
  }

  playMonCry(species: number, pan = 0, volume = 100): void {
    if (!this.enabled) return;
    sound.PlayCry_NormalNoDucking(species, pan, volume, C.CRY_PRIORITY_NORMAL ?? 10);
  }

  /** overworld.c:1131-1153 PlayAmbientCry */
  private playAmbientCry(): void {
    if (!this.enabled || this.ambientCrySpecies === C.SPECIES_NONE) return;
    if (this.ambientCryIsWaterMon && !this.playerIsOnWater) return;
    const pan = (((random() % 88) + 212) << 24) >> 24;
    const volume = (random() % 30) + 50;
    sound.PlayCry_NormalNoDucking(this.ambientCrySpecies, pan, volume, C.CRY_PRIORITY_AMBIENT);
  }

  /**
   * One frame of audio simulation (called by viewerClock 60fps).
   * overworld.c:1155-1185 UpdateAmbientCry
   */
  frame(isEngineOpen = false): void {
    if (!this.initialized) return;
    sound.frame();
    if (!this.enabled || isEngineOpen || this.ambientCrySpecies === C.SPECIES_NONE) return;

    switch (this.ambientCryState) {
      case 0:
        this.ambientCryState = this.ambientCrySpecies === C.SPECIES_NONE ? 4 : 1;
        break;
      case 1:
        this.ambientCryDelay = (random() % 2400) + 1200;
        this.ambientCryState = 3;
        break;
      case 2:
        this.ambientCryDelay = (random() % 1200) + 1200;
        this.ambientCryState = 3;
        break;
      case 3:
        if (--this.ambientCryDelay <= 0) {
          this.playAmbientCry();
          this.ambientCryState = 2;
        }
        break;
      case 4:
        break;
    }
  }
}
