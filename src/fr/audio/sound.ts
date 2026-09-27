// sound.c facade. The m4a player (audio/m4a.ts) implements playback; this
// keeps the timing contracts (fanfares, SE waits, cries) so scripts that wait
// on audio keep working with or without a backend installed.

export interface SoundBackend {
  playSong(player: "bgm" | "se1" | "se2" | "fanfare", song: number): void;
  stop(player: "bgm" | "se1" | "se2" | "fanfare"): void;
  isPlaying(player: "bgm" | "se1" | "se2" | "fanfare"): boolean;
  isPaused(player: "bgm"): boolean;
  pause(player: "bgm"): void;
  resume(player: "bgm"): void;
  fadeOut(player: "bgm", speed: number): void;
  fadeOutTemporarily(player: "bgm", speed: number): void;
  fadeIn(player: "bgm", speed: number): void;
  setVolume(player: "bgm", volume: number): void;
  setPan?(player: "se1" | "se2", pan: number): void;
  playCry(species: number, mode: number): void;
  isCryPlaying(): boolean;
  stopCry?(): void;
  frame(): void;
  setStereo?(stereo: boolean): void;
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
  private fanfareTaskActive = false;
  private seTimer = 0;
  private cryTimer = 0;
  private constants: Record<string, number> = {};
  private fanfareBySong = new Map<number, number>();
  private fanfareSongs: number[] = [];
  private nextMapMusic = 0;
  private mapMusicState = 0;
  private mapMusicFadeInSpeed = 0;
  private disableMusic = false;
  private disableHelpSystemVolumeReduce = false;
  private fallbackBgmPlaying = false;
  private fallbackBgmPaused = false;
  private fallbackFadeTemporary = false;

  init(constants: Record<string, number>): void {
    this.constants = constants;
    this.SE_SELECT = constants.SE_SELECT ?? 5;
    for (const [name, frames] of Object.entries(FANFARE_DURATIONS)) {
      if (constants[name] !== undefined) {
        this.fanfareBySong.set(constants[name], frames);
        if (this.fanfareSongs.length < 14) this.fanfareSongs.push(constants[name]);
      }
    }
  }

  c(name: string): number {
    return this.constants[name] ?? 0;
  }

  /** Called once per game frame (the m4a VBlank tick). */
  frame(): void {
    this.mapMusicMain();
    if (this.fadeOutTimer > 0 && --this.fadeOutTimer === 0) {
      this.fallbackBgmPaused = true;
      if (!this.fallbackFadeTemporary) this.fallbackBgmPlaying = false;
      this.fallbackFadeTemporary = false;
    }
    if (this.fanfareTaskActive) this.Task_Fanfare();
    if (this.seTimer > 0) this.seTimer--;
    if (this.cryTimer > 0) this.cryTimer--;
    this.backend?.frame();
  }

  /** Option-menu output mode; consumed when a playback backend is installed. */
  stereo = false;
  setStereo(stereo: boolean): void {
    this.stereo = stereo;
    this.backend?.setStereo?.(stereo);
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
    this.fallbackBgmPlaying = song !== 0 && song !== this.c("MUS_NONE");
    this.fallbackBgmPaused = false;
    this.fallbackFadeTemporary = false;
    this.fadeOutTimer = 0;
    this.backend?.playSong("bgm", song);
  }

  /** PlayMapChosenOrBattleBGM resets map-music state and stops the previous BGM first. */
  playBattleBGM(song: number): void {
    for (const player of ["bgm", "se1", "se2", "fanfare"] as const) this.backend?.stop(player);
    this.currentBGM = 0;
    this.nextMapMusic = 0;
    this.mapMusicState = 0;
    this.fanfareTimer = 0;
    this.fanfareTaskActive = false;
    this.seTimer = 0;
    this.playBGM(song);
  }

  /** InitMapMusic from sound.c. */
  initMapMusic(): void { this.disableMusic = false; this.resetMapMusic(); }

  /** MapMusicMain from sound.c; called once per game frame. */
  mapMusicMain(): void {
    switch (this.mapMusicState) {
      case 1:
        this.mapMusicState = 2;
        this.playBGM(this.currentBGM = this.nextMapMusic);
        break;
      case 5:
        if (this.isBGMStopped()) {
          this.nextMapMusic = 0;
          this.mapMusicState = 0;
        }
        break;
      case 6:
        if (this.isBGMStopped() && this.isFanfareTaskInactive()) {
          this.currentBGM = this.nextMapMusic;
          this.nextMapMusic = 0;
          this.mapMusicState = 2;
          this.playBGM(this.currentBGM);
        }
        break;
      case 7:
        if (this.isBGMStopped() && this.isFanfareTaskInactive()) {
          this.fadeInNewBGM(this.nextMapMusic, this.mapMusicFadeInSpeed);
          this.currentBGM = this.nextMapMusic;
          this.nextMapMusic = 0;
          this.mapMusicState = 2;
          this.mapMusicFadeInSpeed = 0;
        }
        break;
    }
  }

  /** ResetMapMusic from sound.c. */
  resetMapMusic(): void {
    this.currentBGM = 0;
    this.nextMapMusic = 0;
    this.mapMusicState = 0;
    this.mapMusicFadeInSpeed = 0;
  }

  /** GetCurrentMapMusic from sound.c. */
  getCurrentMapMusic(): number { return this.currentBGM; }

  /** StopMapMusic from sound.c. */
  stopMapMusic(): void {
    this.currentBGM = 0;
    this.nextMapMusic = 0;
    this.mapMusicState = 1;
  }

  /** PlayNewMapMusic */
  playNewMapMusic(song: number): void {
    this.nextMapMusic = song;
    this.mapMusicState = 1;
  }

  /** FadeOutAndPlayNewMapMusic from sound.c. */
  fadeOutAndPlayNewMapMusic(song: number, speed: number): void {
    this.fadeOutMapMusic(speed);
    this.currentBGM = 0;
    this.nextMapMusic = song;
    this.mapMusicState = 6;
  }

  /** FadeOutAndFadeInNewMapMusic from sound.c. */
  fadeOutAndFadeInNewMapMusic(song: number, fadeOutSpeed: number, fadeInSpeed: number): void {
    this.fadeOutMapMusic(fadeOutSpeed);
    this.currentBGM = 0;
    this.nextMapMusic = song;
    this.mapMusicState = 7;
    this.mapMusicFadeInSpeed = fadeInSpeed;
  }

  /** FadeInNewMapMusic (unused in FireRed callers) from sound.c. */
  fadeInNewMapMusic(song: number, speed: number): void {
    this.fadeInNewBGM(song, speed);
    this.currentBGM = song;
    this.nextMapMusic = 0;
    this.mapMusicState = 2;
    this.mapMusicFadeInSpeed = 0;
  }

  stopBGM(): void {
    this.currentBGM = 0;
    this.fallbackBgmPlaying = false;
    this.fallbackBgmPaused = false;
    this.backend?.stop("bgm");
  }

  /** m4aMPlayAllStop */
  m4aMPlayAllStop(): void {
    for (const player of ["bgm", "se1", "se2", "fanfare"] as const) this.backend?.stop(player);
    this.seTimer = 0;
    this.fanfareTimer = 0;
    this.fanfareTaskActive = false;
    this.fallbackBgmPlaying = false;
    this.fallbackBgmPaused = false;
  }

  pauseBGM(): void { this.backend?.pause("bgm"); this.fallbackBgmPaused = true; }
  resumeBGM(): void { this.backend?.resume("bgm"); this.fallbackBgmPaused = false; }

  fadeOutBGM(speed: number): void {
    speed &= 0xff;
    if (speed === 0) return;
    this.backend?.fadeOut("bgm", speed);
    this.fadeOutTimer = speed * 16;
    this.fallbackFadeTemporary = false;
  }

  /** FadeOutBGMTemporarily from sound.c: fade the current track, then pause it for fadeinbgm. */
  FadeOutBGMTemporarily(speed: number): void {
    speed &= 0xff;
    if (speed === 0) return;
    this.backend?.fadeOutTemporarily("bgm", speed);
    this.fadeOutTimer = speed * 16;
    this.fallbackFadeTemporary = true;
  }

  /** FadeOutMapMusic: map transition state is advanced by MapMusicMain. */
  fadeOutMapMusic(speed: number): void {
    if (this.isNotWaitingForBGMStop()) this.fadeOutBGM(speed);
    this.currentBGM = 0;
    this.nextMapMusic = 0;
    this.mapMusicState = 5;
  }

  /** IsNotWaitingForBGMStop from sound.c. */
  isNotWaitingForBGMStop(): boolean {
    return this.mapMusicState !== 5 && this.mapMusicState !== 6 && this.mapMusicState !== 7;
  }

  fadeInBGM(speed: number): void {
    speed &= 0xff;
    this.backend?.fadeIn("bgm", speed);
    if (!this.fallbackBgmPlaying && this.currentBGM !== 0) this.fallbackBgmPlaying = true;
    this.fallbackBgmPaused = false;
    this.fallbackFadeTemporary = false;
    this.fadeOutTimer = 0;
  }

  /** FadeInNewBGM from sound.c. */
  fadeInNewBGM(song: number, speed: number): void {
    if (this.disableMusic || song === this.c("MUS_NONE")) song = 0;
    this.playBGM(song);
    this.backend?.fadeIn("bgm", speed);
  }

  private fadeOutTimer = 0;
  /** IsBGMPausedOrStopped from sound.c. */
  isBGMPausedOrStopped(): boolean {
    return this.backend ? !this.backend.isPlaying("bgm") : !this.fallbackBgmPlaying || this.fallbackBgmPaused;
  }

  /** IsBGMStopped from sound.c: a paused, still-active track is not stopped. */
  isBGMStopped(): boolean {
    if (this.backend) return !this.backend.isPlaying("bgm") && !this.backend.isPaused("bgm");
    return !this.fallbackBgmPlaying;
  }

  playFanfare(song: number): void {
    const index = this.fanfareSongs.indexOf(song);
    this.playFanfareByFanfareNum(index < 0 ? 0 : index);
    this.CreateFanfareTask();
  }

  /** PlayFanfareByFanfareNum from sound.c; Quest Log playback is handled by its caller. */
  playFanfareByFanfareNum(fanfareNum: number): void {
    const song = this.fanfareSongs[fanfareNum];
    if (song === undefined) return;
    this.fanfareSong = song;
    this.fanfareTimer = this.fanfareBySong.get(song) ?? 160;
    this.pauseBGM();
    this.backend?.playSong("fanfare", song);
  }

  /** Task_Fanfare from sound.c. */
  Task_Fanfare(): void {
    if (this.fanfareTimer > 0) {
      this.fanfareTimer--;
    } else {
      this.backend?.stop("fanfare");
      this.resumeBGM();
      this.fanfareTaskActive = false;
    }
  }

  /** CreateFanfareTask from sound.c; the task runner is represented by frame(). */
  CreateFanfareTask(): void {
    if (!this.fanfareTaskActive) this.fanfareTaskActive = true;
  }

  /** StopFanfareByFanfareNum from sound.c. */
  stopFanfareByFanfareNum(fanfareNum: number): void {
    const song = this.fanfareSongs[fanfareNum];
    if (song === undefined) return;
    if (song === this.fanfareSong) {
      this.backend?.stop("fanfare");
    }
  }

  isFanfareTaskInactive(): boolean {
    return !this.fanfareTaskActive;
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

  /** IsBGMPlaying from sound.c excludes paused tracks. */
  isBGMPlaying(): boolean {
    if (this.backend) return this.backend.isPlaying("bgm");
    return this.currentBGM !== 0 || this.fadeOutTimer > 0;
  }

  /** SetBGMVolume_SuppressHelpSystemReduction from sound.c. */
  setBGMVolumeSuppressHelpSystemReduction(volume: number): void {
    this.disableHelpSystemVolumeReduce = true;
    this.setBgmVolume(volume);
  }

  /** BGMVolumeMax_EnableHelpSystemReduction from sound.c. */
  bgmVolumeMaxEnableHelpSystemReduction(): void {
    this.disableHelpSystemVolumeReduce = false;
    this.setBgmVolume(256);
  }

  /** StopCryAndClearCrySongs / main.c ClearPokemonCrySongs. */
  stopCry(): void {
    this.cryTimer = 0;
    this.backend?.stopCry?.();
  }

  /** IsCryPlayingOrClearCrySongs */
  isCryPlaying(): boolean {
    return !this.isCryFinished();
  }

  /** IsCryPlayingOrClearCrySongs from sound.c: clear the cry state when idle. */
  IsCryPlayingOrClearCrySongs(): boolean {
    const playing = this.backend ? this.backend.isCryPlaying() : this.cryTimer > 0;
    if (!playing) ClearPokemonCrySongs();
    return playing;
  }

  /** PlaySE12WithPanning / PlaySE1WithPanning with a signed GBA pan value. */
  playSEWithPanning(song: number, pan: number): void {
    this.playSE(song);
    this.SE12PanpotControl(pan);
  }

  /** SE12PanpotControl from sound.c; both SE players receive the track pan. */
  SE12PanpotControl(pan: number): void {
    this.backend?.setPan?.("se1", pan);
    this.backend?.setPan?.("se2", pan);
  }

  saveBGM(song: number): void { this.savedBGM = song; }
  get saved(): number { return this.savedBGM; }
}

export const sound = new Sound();

/** main.c ClearPokemonCrySongs has no separate browser queue, so clear the voice's pending state. */
export function ClearPokemonCrySongs(): void { sound.stopCry(); }

/** sound.c StopCryAndClearCrySongs: stop the current cry and clear its state. */
export function StopCryAndClearCrySongs(): void { ClearPokemonCrySongs(); }

/** sound.c IsCryPlayingOrClearCrySongs, used by Hall of Fame transitions. */
export function IsCryPlayingOrClearCrySongs(): boolean { return sound.IsCryPlayingOrClearCrySongs(); }
