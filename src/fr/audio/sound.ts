// sound.c facade. The m4a player (audio/m4a.ts) implements playback; until
// it is ready this keeps the timing contracts (fanfares, SE waits, cries)
// so scripts that wait on audio keep working.

export interface SoundBackend {
  playSong(player: "bgm" | "se1" | "se2" | "fanfare", song: number): void;
  stop(player: "bgm" | "se1" | "se2" | "fanfare"): void;
  isPlaying(player: "bgm" | "se1" | "se2" | "fanfare"): boolean;
  pause(player: "bgm"): void;
  resume(player: "bgm"): void;
  fadeOut(player: "bgm", speed: number): void;
  fadeIn(player: "bgm", speed: number): void;
  setVolume(player: "bgm", volume: number): void;
  playCry(species: number, mode: number): void;
  isCryPlaying(): boolean;
  frame(): void;
}

// Fanfare lengths in frames from sound.c sFanfares.
const FANFARE_DURATIONS: Record<string, number> = {
  MUS_LEVEL_UP: 80,
  MUS_OBTAIN_ITEM: 160,
  MUS_EVOLVED: 220,
  MUS_OBTAIN_TMHM: 220,
  MUS_HEAL: 160,
  MUS_OBTAIN_BADGE: 340,
  MUS_MOVE_DELETED: 180,
  MUS_OBTAIN_BERRY: 120,
  MUS_SLOTS_JACKPOT: 250,
  MUS_SLOTS_WIN: 150,
  MUS_TOO_BAD: 160,
  MUS_POKE_FLUTE: 450,
  MUS_OBTAIN_KEY_ITEM: 170,
  MUS_DEX_RATING: 196,
  MUS_OBTAIN_B_POINTS: 313,
  MUS_OBTAIN_SYMBOL: 318,
  MUS_REGISTER_MATCH_CALL: 135,
  MUS_CAUGHT_INTRO: 150,
};

class Sound {
  backend?: SoundBackend;
  SE_SELECT = 5;
  currentBGM = 0;
  private savedBGM = 0;
  private fanfareTimer = 0;
  private fanfareSong = 0;
  private seTimer = 0;
  private cryTimer = 0;
  private constants: Record<string, number> = {};
  private fanfareBySong = new Map<number, number>();

  init(constants: Record<string, number>): void {
    this.constants = constants;
    this.SE_SELECT = constants.SE_SELECT ?? 5;
    for (const [name, frames] of Object.entries(FANFARE_DURATIONS)) {
      if (constants[name] !== undefined) this.fanfareBySong.set(constants[name], frames);
    }
  }

  c(name: string): number {
    return this.constants[name] ?? 0;
  }

  /** Called once per game frame (the m4a VBlank tick). */
  frame(): void {
    if (this.fanfareTimer > 0) {
      this.fanfareTimer--;
      if (this.fanfareTimer === 0) {
        this.backend?.stop("fanfare");
        this.backend?.resume("bgm");
      }
    }
    if (this.seTimer > 0) this.seTimer--;
    if (this.cryTimer > 0) this.cryTimer--;
    this.backend?.frame();
  }

  playSE(song: number): void {
    this.seTimer = 12;
    this.backend?.playSong("se1", song);
  }

  playSE2(song: number): void {
    this.backend?.playSong("se2", song);
  }

  isSEPlaying(): boolean {
    if (this.backend) return this.backend.isPlaying("se1") || this.backend.isPlaying("se2");
    return this.seTimer > 0;
  }

  playBGM(song: number): void {
    this.currentBGM = song;
    this.backend?.playSong("bgm", song);
  }

  /** PlayNewMapMusic */
  playNewMapMusic(song: number): void {
    if (song === this.currentBGM && this.backend?.isPlaying("bgm")) return;
    this.playBGM(song);
  }

  stopBGM(): void {
    this.currentBGM = 0;
    this.backend?.stop("bgm");
  }

  pauseBGM(): void { this.backend?.pause("bgm"); }
  resumeBGM(): void { this.backend?.resume("bgm"); }

  fadeOutBGM(speed: number): void {
    this.backend?.fadeOut("bgm", speed);
    this.fadeOutTimer = speed * 16;
  }

  fadeInBGM(speed: number): void { this.backend?.fadeIn("bgm", speed); }

  private fadeOutTimer = 0;
  isBGMPausedOrStopped(): boolean {
    if (this.backend) return !this.backend.isPlaying("bgm");
    if (this.fadeOutTimer > 0) { this.fadeOutTimer--; return false; }
    return true;
  }

  playFanfare(song: number): void {
    this.fanfareSong = song;
    this.fanfareTimer = this.fanfareBySong.get(song) ?? 160;
    this.backend?.pause("bgm");
    this.backend?.playSong("fanfare", song);
  }

  isFanfareTaskInactive(): boolean {
    return this.fanfareTimer === 0;
  }

  playCry(species: number, mode = 0): void {
    this.cryTimer = 30;
    this.backend?.playCry(species, mode);
  }

  isCryFinished(): boolean {
    if (this.backend) return !this.backend.isCryPlaying();
    return this.cryTimer === 0;
  }

  /** m4aSongNumStop for a sound effect. */
  stopSE(_song: number): void {
    this.seTimer = 0;
    this.backend?.stop("se1");
    this.backend?.stop("se2");
  }

  /** m4aMPlayVolumeControl(&gMPlayInfo_BGM, TRACKS_ALL, volume); 256 = full. */
  setBgmVolume(volume: number): void {
    this.backend?.setVolume("bgm", volume);
  }

  /** IsCryPlayingOrClearCrySongs */
  isCryPlaying(): boolean {
    return !this.isCryFinished();
  }

  /** PlaySE12WithPanning / PlaySE1WithPanning (panning is ignored until the m4a mixer exists). */
  playSEWithPanning(song: number, _pan: number): void {
    this.playSE(song);
  }

  saveBGM(song: number): void { this.savedBGM = song; }
  get saved(): number { return this.savedBGM; }
}

export const sound = new Sound();
