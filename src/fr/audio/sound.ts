// sound.c facade. The m4a player (audio/m4a.ts) implements playback; this
// keeps the timing contracts (fanfares, SE waits, cries) so scripts that wait
// on audio keep working with or without a backend installed.

import * as C from "../generated/constants";
import { tasks, type TaskFunc } from "../gba/tasks";
import { gQuestLogState } from "../questLogEvents";

export interface SoundBackend {
  playSong(player: "bgm" | "se1" | "se2" | "se3" | "fanfare", song: number): void;
  playSE(song: number): void;
  stop(player: "bgm" | "se1" | "se2" | "se3" | "fanfare"): void;
  isPlaying(player: "bgm" | "se1" | "se2" | "se3" | "fanfare"): boolean;
  isPaused(player: "bgm"): boolean;
  pause(player: "bgm"): void;
  resume(player: "bgm"): void;
  fadeOut(player: "bgm", speed: number): void;
  fadeOutTemporarily(player: "bgm", speed: number): void;
  fadeIn(player: "bgm", speed: number): void;
  setVolume(player: "bgm", volume: number): void;
  setPan?(player: "se1" | "se2", pan: number): void;
  playCry(species: number, mode: number, pan?: number, volume?: number, priority?: number, settings?: PokemonCrySettings): void;
  isCryPlaying(): boolean;
  stopCry?(): void;
  frame(): void;
  setStereo?(stereo: boolean): void;
}

export interface PokemonCrySettings {
  pitch: number;
  length: number;
  release: number;
  progress: number;
  chorus: number;
  reverse: boolean;
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
  private specialSETimer = 0;
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
  private pokemonCryBGMDuckingCounter = 0;
  private pokemonCryVolume = 127;
  private pokemonCryPanpot = 64;
  private pokemonCryPitch = 15360;
  private pokemonCryLength = 60;
  private pokemonCryRelease = 0;
  private pokemonCryProgress = 0;
  private pokemonCryChorus = 0;
  private pokemonCryPriority = 255;
  private readonly taskDuckBgmForPokemonCryFunc: TaskFunc = (taskId) => this.Task_DuckBGMForPokemonCry(taskId);

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

  /** m4aSoundInit (m4a.c): install the browser audio player after game constants load. */
  m4aSoundInit(backend: SoundBackend): void {
    this.backend = backend;
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
    if (this.specialSETimer > 0) this.specialSETimer--;
    if (this.cryTimer > 0) this.cryTimer--;
    this.m4aSoundMain();
  }

  /** m4aSoundMain (m4a.c): advance the audio scheduler once per game frame. */
  m4aSoundMain(): void {
    this.backend?.frame();
  }

  /** Option-menu output mode; consumed when a playback backend is installed. */
  stereo = false;
  setStereo(stereo: boolean): void {
    this.stereo = stereo;
    this.backend?.setStereo?.(stereo);
  }

  /** SetPokemonCryStereo (m4a.c): route the C option to the browser output mode. */
  SetPokemonCryStereo(value: number): void { this.setStereo((value >>> 0) !== 0); }

  playSE(song: number): void {
    this.seTimer = 12;
    if ([C.SE_RAIN, C.SE_RAIN_STOP, C.SE_DOWNPOUR, C.SE_DOWNPOUR_STOP, C.SE_THUNDERSTORM, C.SE_THUNDERSTORM_STOP].includes(song & 0xffff)) {
      this.specialSETimer = 12;
    }
    this.backend?.playSE(song);
  }

  playSE2(song: number): void {
    this.backend?.playSong("se2", song);
  }

  isSEPlaying(): boolean {
    if (this.backend) return this.backend.isPlaying("se1") || this.backend.isPlaying("se2");
    return this.seTimer > 0;
  }

  IsSpecialSEPlaying(): boolean {
    return this.backend ? this.backend.isPlaying("se3") : this.specialSETimer > 0;
  }

  playBGM(song: number): void {
    this.m4aSongNumStart(song);
  }

  /** m4aSongNumStart on the browser's dedicated BGM player. */
  m4aSongNumStart(song: number): void {
    song &= 0xffff;
    this.currentBGM = song;
    this.fallbackBgmPlaying = song !== 0 && song !== this.c("MUS_NONE");
    this.fallbackBgmPaused = false;
    this.fallbackFadeTemporary = false;
    this.fadeOutTimer = 0;
    this.backend?.playSong("bgm", song);
  }

  /** m4aSongNumStartOrChange: replace the BGM only when it differs. */
  m4aSongNumStartOrChange(song: number): void {
    song &= 0xffff;
    if (song !== this.currentBGM || this.isBGMPausedOrStopped()) this.m4aSongNumStart(song);
  }

  /** m4aSongNumStartOrContinue: start a different song or resume the same one. */
  m4aSongNumStartOrContinue(song: number): void {
    song &= 0xffff;
    if (song !== this.currentBGM || this.isBGMStopped()) this.m4aSongNumStart(song);
    else if (this.backend?.isPaused("bgm")) this.resumeBGM();
  }

  /** m4aSongNumStop: stop the current BGM when its song number matches. */
  m4aSongNumStop(song: number): void {
    if ((song & 0xffff) !== this.currentBGM) return;
    this.fallbackBgmPlaying = false;
    this.fallbackBgmPaused = false;
    this.backend?.stop("bgm");
  }

  /** m4aSongNumContinue: resume the matching current song. */
  m4aSongNumContinue(song: number): void {
    if ((song & 0xffff) === this.currentBGM) this.resumeBGM();
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
  resumeBGM(): void { this.m4aMPlayContinue(); }

  /** m4aMPlayContinue(&gMPlayInfo_BGM): continue the field music player. */
  m4aMPlayContinue(): void {
    this.backend?.resume("bgm");
    this.fallbackBgmPaused = false;
  }

  fadeOutBGM(speed: number): void {
    this.m4aMPlayFadeOut(speed);
  }

  /** m4aMPlayFadeOut(&gMPlayInfo_BGM, speed). */
  m4aMPlayFadeOut(speed: number): void {
    speed &= 0xff;
    if (speed === 0) return;
    this.backend?.fadeOut("bgm", speed);
    this.fadeOutTimer = speed * 16;
    this.fallbackFadeTemporary = false;
  }

  /** FadeOutBGMTemporarily from sound.c: fade the current track, then pause it for fadeinbgm. */
  FadeOutBGMTemporarily(speed: number): void {
    this.m4aMPlayFadeOutTemporarily(speed);
  }

  /** m4aMPlayFadeOutTemporarily(&gMPlayInfo_BGM, speed). */
  m4aMPlayFadeOutTemporarily(speed: number): void {
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
    this.m4aMPlayFadeIn(speed);
  }

  /** m4aMPlayFadeIn(&gMPlayInfo_BGM, speed). */
  m4aMPlayFadeIn(speed: number): void {
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

  /** WaitFanfare from sound.c; stop selects MUS_DUMMY instead of resuming BGM. */
  WaitFanfare(stop: boolean): boolean {
    if (this.fanfareTimer !== 0) { this.fanfareTimer--; return false; }
    if (!stop) this.resumeBGM();
    else this.backend?.playSong("fanfare", this.constants.MUS_DUMMY ?? 0);
    return true;
  }

  /** FadeInBGM from sound.c. */
  FadeInBGM(speed: number): void { this.fadeInBGM(speed & 0xff); }

  playCry(species: number, mode = C.CRY_MODE_NORMAL, pan = 0, volume = C.CRY_VOLUME, priority = C.CRY_PRIORITY_NORMAL): void {
    this.PlayCryInternal(species, pan, volume, priority, mode);
  }

  /** PlayCryInternal; cry waveforms and DSP are adapted to exported WAVs/Web Audio. */
  PlayCryInternal(species: number, pan: number, volume: number, priority: number, mode: number): void {
    mode &= 0xff;
    let length = 140;
    let reverse = false;
    let release = 0;
    let pitch = 15360;
    let chorus = 0;
    switch (mode) {
      case C.CRY_MODE_DOUBLES: length = 20; release = 225; break;
      case C.CRY_MODE_ENCOUNTER: release = 225; pitch = 15600; chorus = 20; volume = 90; break;
      case C.CRY_MODE_HIGH_PITCH: length = 50; release = 200; pitch = 15800; chorus = 20; volume = 90; break;
      case C.CRY_MODE_ECHO_START: length = 25; reverse = true; release = 100; pitch = 15600; chorus = 192; volume = 90; break;
      case C.CRY_MODE_FAINT: release = 200; pitch = 14440; break;
      case C.CRY_MODE_ECHO_END: release = 220; pitch = 15555; chorus = 192; volume = 90; break;
      case C.CRY_MODE_ROAR_1: length = 10; release = 100; pitch = 14848; break;
      case C.CRY_MODE_ROAR_2: length = 60; release = 225; pitch = 15616; break;
      case C.CRY_MODE_GROWL_1: length = 15; reverse = true; release = 125; pitch = 15200; break;
      case C.CRY_MODE_GROWL_2: length = 100; release = 225; pitch = 15200; break;
      case C.CRY_MODE_WEAK_DOUBLES: length = 20; release = 225; pitch = 15000; break;
      case C.CRY_MODE_WEAK: pitch = 15000; break;
    }
    this.SetPokemonCryVolume(volume);
    this.SetPokemonCryPanpot((pan << 24) >> 24);
    this.SetPokemonCryPitch(pitch);
    this.SetPokemonCryLength(length);
    this.SetPokemonCryProgress(0);
    this.SetPokemonCryRelease(release);
    this.SetPokemonCryChorus(chorus);
    this.SetPokemonCryPriority(priority);
    this.SetPokemonCryTone(species, mode, reverse);
  }

  /** SetPokemonCryVolume (m4a.c). */
  SetPokemonCryVolume(value: number): void { this.pokemonCryVolume = value & 0x7f; }

  /** SetPokemonCryPanpot (m4a.c), centered at C_V before passing to WebAudio. */
  SetPokemonCryPanpot(value: number): void { this.pokemonCryPanpot = (((value << 24) >> 24) + 64) & 0x7f; }

  /** SetPokemonCryPitch (m4a.c); pitch is adapted to the WAV playback rate. */
  SetPokemonCryPitch(value: number): void { this.pokemonCryPitch = ((value << 16) >> 16) & 0xffff; }

  /** SetPokemonCryLength (m4a.c). */
  SetPokemonCryLength(value: number): void { this.pokemonCryLength = value & 0xffff; }

  /** SetPokemonCryRelease (m4a.c). */
  SetPokemonCryRelease(value: number): void { this.pokemonCryRelease = value & 0xff; }

  /** SetPokemonCryProgress (m4a.c). */
  SetPokemonCryProgress(value: number): void { this.pokemonCryProgress = value >>> 0; }

  /** SetPokemonCryChorus (m4a.c). */
  SetPokemonCryChorus(value: number): void { this.pokemonCryChorus = (value << 24) >> 24; }

  /** SetPokemonCryPriority (m4a.c); priority arbitration is limited by the single WAV voice. */
  SetPokemonCryPriority(value: number): void { this.pokemonCryPriority = value & 0xff; }

  /** SetPokemonCryTone (m4a.c): select the species WAV in place of the C tone-table pointer. */
  SetPokemonCryTone(species: number, mode: number, reverse: boolean): void {
    this.cryTimer = 30;
    this.backend?.playCry(
      species,
      mode,
      this.pokemonCryPanpot - 64,
      this.pokemonCryVolume,
      this.pokemonCryPriority,
      {
        pitch: this.pokemonCryPitch,
        length: this.pokemonCryLength,
        release: this.pokemonCryRelease,
        progress: this.pokemonCryProgress,
        chorus: this.pokemonCryChorus,
        reverse,
      },
    );
  }

  /** IsPokemonCryPlaying (m4a.c): the browser backend owns the active cry voice. */
  IsPokemonCryPlaying(_musicPlayer?: unknown): boolean {
    return this.backend ? this.backend.isCryPlaying() : this.cryTimer > 0;
  }

  PlayCry_Normal(species: number, pan: number): void {
    this.setBgmVolume(85);
    this.PlayCryInternal(species, pan, C.CRY_VOLUME, C.CRY_PRIORITY_NORMAL, C.CRY_MODE_NORMAL);
    this.pokemonCryBGMDuckingCounter = 2;
    this.RestoreBGMVolumeAfterPokemonCry();
  }

  PlayCry_NormalNoDucking(species: number, pan: number, volume: number, priority: number): void {
    this.PlayCryInternal(species, pan, volume, priority, C.CRY_MODE_NORMAL);
  }

  PlayCry_ByMode(species: number, pan: number, mode: number): void {
    mode &= 0xff;
    if (mode === C.CRY_MODE_DOUBLES) {
      this.PlayCryInternal(species, pan, C.CRY_VOLUME, C.CRY_PRIORITY_NORMAL, mode);
      return;
    }
    this.setBgmVolume(85);
    this.PlayCryInternal(species, pan, C.CRY_VOLUME, C.CRY_PRIORITY_NORMAL, mode);
    this.pokemonCryBGMDuckingCounter = 2;
    this.RestoreBGMVolumeAfterPokemonCry();
  }

  PlayCry_ReleaseDouble(species: number, pan: number, mode: number, isMultiBattle = false): void {
    mode &= 0xff;
    if (mode === C.CRY_MODE_DOUBLES) {
      this.PlayCryInternal(species, pan, C.CRY_VOLUME, C.CRY_PRIORITY_NORMAL, mode);
    } else {
      if (!isMultiBattle) this.setBgmVolume(85);
      this.PlayCryInternal(species, pan, C.CRY_VOLUME, C.CRY_PRIORITY_NORMAL, mode);
    }
  }

  PlayCry_Script(species: number, mode: number): void {
    if (gQuestLogState !== C.QL_STATE_PLAYBACK) {
      this.setBgmVolume(85);
      this.PlayCryInternal(species, 0, C.CRY_VOLUME, C.CRY_PRIORITY_NORMAL, mode & 0xff);
    }
    this.pokemonCryBGMDuckingCounter = 2;
    this.RestoreBGMVolumeAfterPokemonCry();
  }

  RestoreBGMVolumeAfterPokemonCry(): void {
    if (!tasks.isActive(this.taskDuckBgmForPokemonCryFunc)) tasks.create(this.taskDuckBgmForPokemonCryFunc, 80);
  }

  Task_DuckBGMForPokemonCry(taskId: number): void {
    if (this.pokemonCryBGMDuckingCounter !== 0) {
      this.pokemonCryBGMDuckingCounter--;
      return;
    }
    if (!this.backend?.isCryPlaying() && this.cryTimer === 0) {
      this.setBgmVolume(256);
      tasks.destroy(taskId);
    }
  }

  isCryFinished(): boolean {
    if (tasks.isActive(this.taskDuckBgmForPokemonCryFunc)) return false;
    if (this.backend) return !this.IsPokemonCryPlaying();
    return this.cryTimer === 0;
  }

  /** IsCryFinished from sound.c clears the completed cry tables before returning TRUE. */
  IsCryFinished(): boolean {
    if (!this.isCryFinished()) return false;
    ClearPokemonCrySongs();
    return true;
  }

  /** m4aSongNumStop for a sound effect. */
  stopSE(_song: number): void {
    this.seTimer = 0;
    this.backend?.stop("se1");
    this.backend?.stop("se2");
  }

  /** m4aMPlayVolumeControl(&gMPlayInfo_BGM, TRACKS_ALL, volume); 256 = full. */
  setBgmVolume(volume: number): void {
    this.m4aMPlayVolumeControl(volume);
  }

  /** m4aMPlayVolumeControl(&gMPlayInfo_BGM, TRACKS_ALL, volume). */
  m4aMPlayVolumeControl(volume: number): void {
    this.backend?.setVolume("bgm", volume & 0xffff);
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
    const playing = this.IsPokemonCryPlaying();
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
    this.m4aMPlayPanpotControl("se1", C.TRACKS_ALL, pan);
    this.m4aMPlayPanpotControl("se2", C.TRACKS_ALL, pan);
  }

  /** m4aMPlayPanpotControl (m4a.c): apply the selected tracks' pan to a browser SE player. */
  m4aMPlayPanpotControl(player: "se1" | "se2", trackBits: number, pan: number): void {
    if ((trackBits & 0xffff) === 0) return;
    this.backend?.setPan?.(player, (pan << 24) >> 24);
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
