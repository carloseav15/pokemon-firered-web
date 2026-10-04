import { sound } from "../../fr/audio/sound";
import { createM4aBackend } from "../../fr/audio/m4a";
import { rom } from "../../fr/rom";
import * as C from "../../fr/generated/constants";

export class ViewerAudioController {
  private initialized = false;
  private currentMapId: string | null = null;
  private enabled = false;

  constructor() {}

  init(): void {
    if (this.initialized) return;
    try {
      sound.init(rom.constants);
      sound.m4aSoundInit(createM4aBackend());
      this.initialized = true;
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  enable(): void {
    this.enabled = true;
    this.init();
    if (this.currentMapId) {
      this.playMapMusic(this.currentMapId);
    }
  }

  disable(): void {
    this.enabled = false;
    sound.stopMapMusic();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  updateMap(mapId: string, musicId?: number): void {
    if (this.currentMapId === mapId) return;
    this.currentMapId = mapId;
    if (!this.enabled) return;
    this.playMapMusic(mapId, musicId);
  }

  private playMapMusic(mapId: string, musicId?: number): void {
    if (!this.enabled) return;
    this.init();
    const songId = musicId ?? rom.c(`MUS_${mapId}`) ?? C.MUS_PALLET;
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

  frame(): void {
    if (this.initialized) {
      sound.frame();
    }
  }
}
