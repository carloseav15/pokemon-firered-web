// m4a.c / sound.c playback backend on WebAudio. Songs play from the exported
// standard MIDI sources (song timbres follow voice_groups.inc: square waves,
// direct-sound samples, noise drums; duty cycles, sweep, reverb and exact
// ADSR curves are approximated), cries play from the exported PCM wavs.
// Music loops, one-shots don't. Browsers require a user gesture before audio
// starts, so playback begins on the first input.

import { DATA_ROOT } from "../rom";
import * as C from "../generated/constants";
import type { SoundBackend } from "./sound";

const AUDIO_ROOT = `${DATA_ROOT}/audio`;

type SongEntry = {
  id: number; name: string; midi: string | null; player: number;
  voicegroup: number; volume: number; reverb: number; priority: number;
};

type Voice = {
  kind: string; base: number; pan: number; sample?: string;
  attack: number; decay: number; sustain: number; release: number;
};

export type MidiEvent =
  | { time: number; type: "note"; channel: number; note: number; vel: number; dur: number }
  | { time: number; type: "program"; channel: number; program: number };

export type ParsedSong = { events: MidiEvent[]; duration: number };

function u16(data: Uint8Array, pos: number): number {
  return (data[pos]! << 8) | data[pos + 1]!;
}

function vlq(data: Uint8Array, pos: number): [number, number] {
  let value = 0;
  let byte = 0;
  do {
    byte = data[pos++]!;
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return [value, pos];
}

/** Standard MIDI file -> timed note/program events (tempo map applied). */
export function parseSmf(data: Uint8Array): ParsedSong {
  if (data[0] !== 0x4d || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) {
    throw new Error("not a MIDI file");
  }
  const division = u16(data, 12);
  const tracks = u16(data, 10);
  const ticksPerBeat = division & 0x7fff;
  let pos = 14;
  const notes: Array<{ tick: number; channel: number; note: number; vel: number; dur: number }> = [];
  const programs: Array<{ tick: number; channel: number; program: number }> = [];
  for (let t = 0; t < tracks; t++) {
    if (data[pos] !== 0x4d || data[pos + 1] !== 0x54 || data[pos + 2] !== 0x72 || data[pos + 3] !== 0x6b) break;
    const len = (data[pos + 4]! << 24) | (data[pos + 5]! << 16) | (data[pos + 6]! << 8) | data[pos + 7]!;
    let p = pos + 8;
    const end = p + len;
    let tick = 0;
    let status = 0;
    const open = new Map<number, { tick: number; vel: number }>();
    while (p < end) {
      const [delta, p1] = vlq(data, p);
      p = p1;
      tick += delta;
      let byte = data[p]!;
      if (byte < 0x80) {
        byte = status;
      } else {
        p++;
        status = byte;
      }
      const kind = byte & 0xf0;
      const channel = byte & 0x0f;
      if (kind === 0x90 || kind === 0x80) {
        const note = data[p++]!;
        const vel = data[p++]!;
        const key = (channel << 8) | note;
        if (kind === 0x90 && vel !== 0) {
          const prev = open.get(key);
          if (prev) {
            notes.push({ tick: prev.tick, channel, note, vel: prev.vel, dur: tick - prev.tick });
          }
          open.set(key, { tick, vel });
        } else {
          const prev = open.get(key);
          if (prev) {
            notes.push({ tick: prev.tick, channel, note, vel: prev.vel, dur: tick - prev.tick });
            open.delete(key);
          }
        }
      } else if (kind === 0xc0) {
        programs.push({ tick, channel, program: data[p++]! });
      } else if (kind === 0xd0 || kind === 0xa0) {
        p += kind === 0xd0 ? 1 : 2;
      } else if (kind === 0xb0 || kind === 0xe0) {
        p += 2;
      } else if (byte === 0xff) {
        const meta = data[p++]!;
        const [mlen, p2] = vlq(data, p);
        p = p2 + mlen;
      } else if (byte === 0xf0 || byte === 0xf7) {
        const [mlen, p2] = vlq(data, p);
        p = p2 + mlen;
      } else {
        break;
      }
    }
    pos = end;
  }
  // Times come from the tempo map pass below.
  return withTempo(data, notes, programs, ticksPerBeat);
}

function withTempo(
  data: Uint8Array,
  notes: Array<{ tick: number; channel: number; note: number; vel: number; dur: number }>,
  programs: Array<{ tick: number; channel: number; program: number }>,
  ticksPerBeat: number,
): ParsedSong {
  const changes: Array<{ tick: number; tempo: number }> = [{ tick: 0, tempo: 500000 }];
  const tracks = u16(data, 10);
  let pos = 14;
  for (let t = 0; t < tracks; t++) {
    if (pos + 8 > data.length) break;
    const len = (data[pos + 4]! << 24) | (data[pos + 5]! << 16) | (data[pos + 6]! << 8) | data[pos + 7]!;
    let p = pos + 8;
    const end = Math.min(p + len, data.length);
    let tick = 0;
    let status = 0;
    while (p < end) {
      const [delta, p1] = vlq(data, p);
      p = p1;
      tick += delta;
      let byte = data[p]!;
      if (byte < 0x80) byte = status;
      else { p++; status = byte; }
      if (byte === 0xff) {
        const meta = data[p++]!;
        const [mlen, p2] = vlq(data, p);
        p = p2;
        if (meta === 0x51 && mlen === 3) {
          changes.push({ tick, tempo: (data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]! });
        }
        p += mlen;
      } else if (byte === 0xf0 || byte === 0xf7) {
        const [mlen, p2] = vlq(data, p);
        p = p2 + mlen;
      } else {
        const kind = byte & 0xf0;
        p += kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      }
    }
    pos = end;
  }
  changes.sort((a, b) => a.tick - b.tick);
  const toTime = (tick: number): number => {
    let time = 0;
    let lastTick = 0;
    let tempo = 500000;
    for (const change of changes) {
      if (change.tick > tick) break;
      time += ((change.tick - lastTick) * tempo) / 1000000 / ticksPerBeat;
      lastTick = change.tick;
      tempo = change.tempo;
    }
    time += ((tick - lastTick) * tempo) / 1000000 / ticksPerBeat;
    return time;
  };
  const events: MidiEvent[] = [
    ...programs.map((e) => ({ time: toTime(e.tick), type: "program" as const, channel: e.channel, program: e.program })),
    ...notes.map((e) => ({
      time: toTime(e.tick), type: "note" as const, channel: e.channel,
      note: e.note, vel: e.vel, dur: Math.max(0.03, toTime(e.tick + e.dur) - toTime(e.tick)),
    })),
  ];
  events.sort((a, b) => a.time - b.time);
  const duration = events.reduce((max, e) => Math.max(max, e.time + (e.type === "note" ? e.dur : 0)), 0);
  return { events, duration };
}

const midiFreq = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

type SongData = { entry: SongEntry; song: ParsedSong; voices: Voice[] };

class SongPlayer {
  private data: SongData | null = null;
  private eventIndex = 0;
  private startAt = 0;
  private offset = 0;
  private playing = false;
  private loop = false;
  private gain: GainNode | null = null;
  private volumeControl: GainNode | null = null;
  private fadeControl: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private pan = 0;
  private readonly programs = new Array<number>(16).fill(0);
  private readonly sources = new Set<AudioScheduledSourceNode>();

  constructor(private readonly backend: M4aBackend, private readonly out: GainNode, private readonly useBgmVolume: boolean) {}

  start(data: SongData, loop: boolean, at: number, offset = 0): void {
    this.stop(at);
    this.data = data;
    this.loop = loop;
    this.eventIndex = 0;
    this.offset = offset;
    this.startAt = at;
    this.playing = true;
    this.programs.fill(0);
    this.gain = this.backend.ctx!.createGain();
    this.gain.gain.value = data.entry.volume / 100;
    this.volumeControl = this.backend.ctx!.createGain();
    this.volumeControl.gain.value = this.useBgmVolume ? this.backend.master : 1;
    this.fadeControl = this.backend.ctx!.createGain();
    this.fadeControl.gain.value = 1;
    this.panner = this.backend.ctx!.createStereoPanner();
    this.panner.pan.value = this.backend.panValue(this.pan);
    this.gain.connect(this.volumeControl);
    this.volumeControl.connect(this.fadeControl);
    this.fadeControl.connect(this.panner);
    this.panner.connect(this.out);
    // Skip events before the resume offset.
    while (this.eventIndex < data.song.events.length && data.song.events[this.eventIndex]!.time < offset) {
      const event = data.song.events[this.eventIndex]!;
      if (event.type === "program") this.programs[event.channel] = event.program;
      this.eventIndex++;
    }
  }

  stop(at?: number): void {
    const when = at ?? this.backend.now();
    for (const src of this.sources) {
      try { src.stop(when); } catch { /* already stopped */ }
    }
    this.sources.clear();
    if (this.gain) {
      try { this.gain.disconnect(); } catch { /* disconnected */ }
      this.gain = null;
    }
    if (this.volumeControl) {
      try { this.volumeControl.disconnect(); } catch { /* disconnected */ }
      this.volumeControl = null;
    }
    if (this.fadeControl) {
      try { this.fadeControl.disconnect(); } catch { /* disconnected */ }
      this.fadeControl = null;
    }
    if (this.panner) {
      try { this.panner.disconnect(); } catch { /* disconnected */ }
      this.panner = null;
    }
    this.playing = false;
  }

  setPan(pan: number): void {
    this.pan = Math.max(-64, Math.min(63, Math.trunc(pan)));
    if (!this.panner || !this.backend.ctx) return;
    const at = this.backend.ctx.currentTime;
    this.panner.pan.setTargetAtTime(this.backend.panValue(this.pan), at, 0.01);
  }

  get active(): boolean {
    return this.playing;
  }

  /** Schedule events up to the lookahead horizon. */
  frame(at: number): void {
    if (!this.playing || !this.data || !this.gain) return;
    const horizon = at + 0.15;
    for (;;) {
      if (this.eventIndex >= this.data.song.events.length) {
        if (this.loop && this.data.song.duration > 0) {
          this.startAt = this.startAt + this.data.song.duration - this.offset;
          this.offset = 0;
          this.eventIndex = 0;
          this.programs.fill(0);
          continue;
        }
        if (at >= this.startAt + this.data.song.duration - this.offset + 0.1) this.stop(at);
        return;
      }
      const event = this.data.song.events[this.eventIndex]!;
      const when = this.startAt + event.time - this.offset;
      if (when > horizon) return;
      this.eventIndex++;
      if (when < at - 0.05) continue;
      if (event.type === "program") {
        this.programs[event.channel] = event.program;
      } else {
        this.backend.playNote(this, event, Math.max(at, when));
      }
    }
  }

  programOf(channel: number): number {
    return this.programs[channel] ?? 0;
  }

  currentData(): SongData | null {
    return this.data;
  }

  position(at: number): number {
    if (!this.data) return 0;
    return this.offset + Math.max(0, at - this.startAt);
  }

  track(source: AudioScheduledSourceNode): void {
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  destination(): GainNode | null {
    return this.gain;
  }

  fadeDestination(): GainNode | null { return this.fadeControl; }

  setMasterVolume(master: number): void {
    if (!this.volumeControl) return;
    const at = this.backend.now();
    this.volumeControl.gain.setTargetAtTime(master, at, 0.01);
  }
}

export class M4aBackend implements SoundBackend {
  ctx: AudioContext | null = null;
  master = 1;
  private songs: SongEntry[] | null = null;
  private voices: Record<string, Voice[]> | null = null;
  private samples: Record<string, string> | null = null;
  private cries: Array<string | null> | null = null;
  private readonly players = new Map<string, SongPlayer>();
  private readonly playerPans = new Map<"se1" | "se2", number>([["se1", 0], ["se2", 0]]);
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly reversedCryBuffers = new Map<string, AudioBuffer>();
  private readonly midiCache = new Map<number, ParsedSong>();
  private readonly requestToken = new Map<string, number>();
  private readonly loadingPlayers = new Set<string>();
  private pendingTemporaryFadeSpeed: number | undefined;
  private pendingFadeOutSpeed: number | undefined;
  private readonly paused = new Map<string, { id: number; offset: number; loop: boolean }>();
  private out: GainNode | null = null;
  private crySource: AudioBufferSourceNode | null = null;
  private cryGeneration = 0;
  private cryLoading = false;
  private cryUntil = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private noiseSeed = 0x1ace;
  private stereo = true;

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  panValue(pan: number): number {
    return this.stereo ? pan / 64 : 0;
  }

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 1;
      this.out.connect(this.ctx.destination);
      for (const key of ["bgm", "se1", "se2", "se3", "fanfare"] as const) {
        this.players.set(key, new SongPlayer(this, this.out, key === "bgm"));
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private async tables(): Promise<boolean> {
    if (this.songs) return true;
    try {
      const [songs, voices, samples, cries] = await Promise.all([
        fetch(`${AUDIO_ROOT}/songs.json`).then((r) => r.json()),
        fetch(`${AUDIO_ROOT}/voicegroups.json`).then((r) => r.json()),
        fetch(`${AUDIO_ROOT}/samples.json`).then((r) => r.json()),
        fetch(`${AUDIO_ROOT}/cries.json`).then((r) => r.json()),
      ]);
      this.songs = songs.songs as SongEntry[];
      this.voices = voices.groups as Record<string, Voice[]>;
      this.samples = samples.samples as Record<string, string>;
      this.cries = cries.order as Array<string | null>;
      return true;
    } catch {
      return false;
    }
  }

  private voiceOf(group: number, program: number): Voice | undefined {
    return this.voices?.[`voicegroup${String(group).padStart(3, "0")}`]?.[program];
  }

  private async songData(id: number): Promise<SongData | null> {
    if (!(await this.tables())) return null;
    const entry = this.songs!.find((s) => s.id === id);
    if (!entry?.midi) return null;
    let song = this.midiCache.get(id);
    if (!song) {
      try {
        const bytes = new Uint8Array(await (await fetch(`${AUDIO_ROOT}/midi/${entry.midi}`)).arrayBuffer());
        song = parseSmf(bytes);
        this.midiCache.set(id, song);
      } catch {
        return null;
      }
    }
    const voices = this.voices?.[`voicegroup${String(entry.voicegroup).padStart(3, "0")}`] ?? [];
    return { entry, song, voices };
  }

  playSE(song: number): void {
    if (!this.ensure()) return;
    void this.tables().then((ready) => {
      if (!ready) return;
      const entry = this.songs!.find((candidate) => candidate.id === (song & 0xffff));
      if (!entry) return;
      const player = (["bgm", "se1", "se2", "se3"] as const)[entry.player];
      if (player) this.playSong(player, song);
    });
  }

  playSong(player: "bgm" | "se1" | "se2" | "se3" | "fanfare", song: number): void {
    if (!this.ensure()) return;
    const handle = this.players.get(player);
    if (!handle) return;
    const token = (this.requestToken.get(player) ?? 0) + 1;
    this.requestToken.set(player, token);
    this.paused.delete(player);
    this.loadingPlayers.add(player);
    void this.songData(song).then((data) => {
      // A newer playSong call may have replaced this one while fetching.
      if (this.requestToken.get(player) !== token) return;
      this.loadingPlayers.delete(player);
      if (!data || !this.ctx || !this.out) {
        if (player === "bgm") {
          this.pendingTemporaryFadeSpeed = undefined;
          this.pendingFadeOutSpeed = undefined;
        }
        return;
      }
      handle.start(data, player === "bgm", this.ctx.currentTime + 0.02);
      if (player === "bgm" && this.pendingTemporaryFadeSpeed !== undefined) {
        const speed = this.pendingTemporaryFadeSpeed;
        this.pendingTemporaryFadeSpeed = undefined;
        this.fadeOutTemporarily(player, speed);
      } else if (player === "bgm" && this.pendingFadeOutSpeed !== undefined) {
        const speed = this.pendingFadeOutSpeed;
        this.pendingFadeOutSpeed = undefined;
        this.fadeOut(player, speed);
      }
    });
  }

  stop(player: "bgm" | "se1" | "se2" | "se3" | "fanfare"): void {
    this.requestToken.set(player, (this.requestToken.get(player) ?? 0) + 1);
    this.loadingPlayers.delete(player);
    this.paused.delete(player);
    if (player === "bgm") this.pendingTemporaryFadeSpeed = undefined;
    if (player === "bgm") this.pendingFadeOutSpeed = undefined;
    this.players.get(player)?.stop();
  }

  isPlaying(player: "bgm" | "se1" | "se2" | "se3" | "fanfare"): boolean {
    return this.loadingPlayers.has(player) || (this.players.get(player)?.active ?? false);
  }

  isPaused(player: "bgm"): boolean { return this.paused.has(player); }

  pause(player: "bgm"): void {
    const handle = this.players.get(player);
    const data = handle?.currentData();
    if (!this.ctx || !handle || !data) return;
    this.paused.set(player, { id: data.entry.id, offset: handle.position(this.ctx.currentTime), loop: player === "bgm" });
    handle.stop();
  }

  resume(player: "bgm", fadeInSpeed?: number): void {
    const saved = this.paused.get(player);
    if (!saved || !this.ensure()) return;
    this.paused.delete(player);
    const handle = this.players.get(player);
    if (!handle) return;
    const token = (this.requestToken.get(player) ?? 0) + 1;
    this.requestToken.set(player, token);
    this.loadingPlayers.add(player);
    void this.songData(saved.id).then((data) => {
      if (this.requestToken.get(player) !== token) return;
      this.loadingPlayers.delete(player);
      if (!data || !this.ctx) return;
      handle.start(data, saved.loop, this.ctx.currentTime + 0.02, saved.offset);
      if (fadeInSpeed !== undefined) this.applyFadeIn(player, fadeInSpeed);
    });
  }

  fadeOut(player: "bgm", speed: number): void {
    if (speed <= 0) return;
    const handle = this.players.get(player);
    const dest = handle?.fadeDestination();
    if (!this.ctx || !handle || !dest) {
      if (this.loadingPlayers.has(player)) {
        this.pendingTemporaryFadeSpeed = undefined;
        this.pendingFadeOutSpeed = speed;
      } else handle?.stop();
      return;
    }
    const at = this.ctx.currentTime;
    dest.gain.cancelScheduledValues(at);
    dest.gain.setValueAtTime(dest.gain.value, at);
    dest.gain.linearRampToValueAtTime(0, at + Math.max(0.05, (speed * 16) / 60));
    // Only stop if no newer song replaced this one while fading.
    window.setTimeout(() => {
      if (handle.fadeDestination() === dest) handle.stop();
    }, Math.max(60, (speed * 16 * 1000) / 60));
  }

  /** m4aMPlayFadeOutTemporarily: fade to silence, then pause and retain song position. */
  fadeOutTemporarily(player: "bgm", speed: number): void {
    const handle = this.players.get(player);
    const dest = handle?.fadeDestination();
    if (speed <= 0) return;
    if ((!this.ctx || !handle || !dest) && this.loadingPlayers.has(player)) {
      this.pendingFadeOutSpeed = undefined;
      this.pendingTemporaryFadeSpeed = speed;
      return;
    }
    if (!this.ctx || !handle || !dest) return;
    const at = this.ctx.currentTime;
    const duration = Math.max(0.05, (speed * 16) / 60);
    dest.gain.cancelScheduledValues(at);
    dest.gain.setValueAtTime(dest.gain.value, at);
    dest.gain.linearRampToValueAtTime(0, at + duration);
    window.setTimeout(() => {
      if (handle.fadeDestination() === dest) this.pause(player);
    }, Math.max(60, duration * 1000));
  }

  fadeIn(player: "bgm", speed: number): void {
    if (this.paused.has(player)) {
      this.resume(player, speed > 0 ? speed : undefined);
      return;
    }
    if (speed <= 0) return;
    this.applyFadeIn(player, speed);
  }

  private applyFadeIn(player: "bgm", speed: number): void {
    const dest = this.players.get(player)?.fadeDestination();
    if (!this.ctx || !dest) return;
    const at = this.ctx.currentTime;
    dest.gain.cancelScheduledValues(at);
    dest.gain.setValueAtTime(0, at);
    dest.gain.linearRampToValueAtTime(1, at + Math.max(0.05, (speed * 16) / 60));
  }

  setVolume(player: "bgm", volume: number): void {
    this.master = volume / 256;
    this.players.get(player)?.setMasterVolume(this.master);
  }

  playCry(species: number, mode: number, pan = 0, volume = 120, priority = 10): void {
    void priority; // C voice priority arbitrates its four cry players; this backend uses a single current buffer.
    if (!this.ensure() || !this.ctx || !this.out) return;
    const generation = ++this.cryGeneration;
    this.cryLoading = true;
    void (async () => {
      if (!(await this.tables())) {
        if (generation === this.cryGeneration) this.cryLoading = false;
        return;
      }
      const file = this.cries?.[species];
      if (!file || !this.ctx || !this.out) {
        if (generation === this.cryGeneration) this.cryLoading = false;
        return;
      }
      let buffer = this.buffers.get(`cry:${file}`);
      if (!buffer) {
        try {
          buffer = await this.ctx.decodeAudioData(await (await fetch(`${AUDIO_ROOT}/cries/${file}`)).arrayBuffer());
          this.buffers.set(`cry:${file}`, buffer);
        } catch {
          if (generation === this.cryGeneration) this.cryLoading = false;
          return;
        }
      }
      if (generation !== this.cryGeneration) return;
      this.cryLoading = false;
      // Apply the pitch/volume overrides from PlayCryInternal; wav timing, chorus and release remain approximations.
      const pitchByMode: Record<number, number> = {
        [C.CRY_MODE_ENCOUNTER]: 15600,
        [C.CRY_MODE_HIGH_PITCH]: 15800,
        [C.CRY_MODE_ECHO_START]: 15600,
        [C.CRY_MODE_FAINT]: 14440,
        [C.CRY_MODE_ECHO_END]: 15555,
        [C.CRY_MODE_ROAR_1]: 14848,
        [C.CRY_MODE_ROAR_2]: 15616,
        [C.CRY_MODE_GROWL_1]: 15200,
        [C.CRY_MODE_GROWL_2]: 15200,
        [C.CRY_MODE_WEAK]: 15000,
        [C.CRY_MODE_WEAK_DOUBLES]: 15000,
      };
      const rate = (pitchByMode[mode] ?? 15360) / 15360;
      const modeVolume = mode === C.CRY_MODE_ENCOUNTER || mode === C.CRY_MODE_HIGH_PITCH
        || mode === C.CRY_MODE_ECHO_START || mode === C.CRY_MODE_ECHO_END ? 90 : volume;
      const src = this.ctx.createBufferSource();
      const reverse = mode === C.CRY_MODE_ECHO_START || mode === C.CRY_MODE_GROWL_1;
      src.buffer = reverse ? this.reversedCryBuffer(file, buffer) : buffer;
      src.playbackRate.value = rate;
      const gain = this.ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, modeVolume / 127));
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = this.panValue(pan);
      src.connect(gain);
      gain.connect(panner);
      panner.connect(this.out);
      this.crySource = src;
      const dur = buffer.duration / rate;
      const play = mode === 1 ? Math.min(dur, 0.4) : dur;
      this.cryUntil = this.ctx.currentTime + play;
      src.start();
      src.stop(this.ctx.currentTime + play + 0.05);
    })();
  }

  private reversedCryBuffer(file: string, source: AudioBuffer): AudioBuffer {
    const existing = this.reversedCryBuffers.get(file);
    if (existing) return existing;
    const reversed = this.ctx!.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      const input = source.getChannelData(channel);
      const output = reversed.getChannelData(channel);
      for (let i = 0, end = input.length - 1; i < input.length; i++, end--) output[i] = input[end]!;
    }
    this.reversedCryBuffers.set(file, reversed);
    return reversed;
  }

  isCryPlaying(): boolean {
    return !!this.ctx && (this.cryLoading || this.ctx.currentTime < this.cryUntil);
  }

  stopCry(): void {
    this.cryGeneration++;
    this.crySource?.stop();
    this.crySource = null;
    this.cryLoading = false;
    this.cryUntil = 0;
  }

  frame(): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const at = this.ctx.currentTime;
    for (const player of this.players.values()) player.frame(at);
  }

  setStereo(stereo: boolean): void {
    this.stereo = stereo;
    for (const player of ["se1", "se2"] as const) {
      const handle = this.players.get(player);
      if (handle) handle.setPan(this.playerPans.get(player) ?? 0);
    }
  }

  setPan(player: "se1" | "se2", pan: number): void {
    const clampedPan = Math.max(-64, Math.min(63, Math.trunc(pan)));
    this.playerPans.set(player, clampedPan);
    this.players.get(player)?.setPan(clampedPan);
  }

  /** Render one MIDI note through the song's voicegroup program. */
  playNote(handle: SongPlayer, event: Extract<MidiEvent, { type: "note" }>, when: number): void {
    if (!this.ctx) return;
    const dest = handle.destination();
    const data = handle.currentData();
    if (!dest || !data) return;
    if (event.channel === 9) {
      this.drum(event.note, event.vel / 127, when, dest);
      return;
    }
    const program = handle.programOf(event.channel);
    const voice = data.voices[program] ?? this.voiceOf(data.entry.voicegroup, program);
    const kind = voice?.kind ?? "square_1";
    if (kind.startsWith("voice_directsound") && voice?.sample) {
      this.sampleNote(voice, event, when, dest);
      return;
    }
    if (kind.startsWith("voice_noise")) {
      this.noiseNote(event, when, event.dur, dest, 1000 + event.note * 40);
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = kind.startsWith("voice_square") ? "square" : "triangle";
    osc.frequency.value = midiFreq(event.note);
    const gain = this.ctx.createGain();
    const peak = Math.max(0.001, (event.vel / 127) * 0.22 * (data.entry.volume / 100));
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0011, peak), when + 0.008);
    gain.gain.setValueAtTime(Math.max(0.0011, peak), when + Math.max(0.008, event.dur - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + event.dur + 0.05);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(when);
    osc.stop(when + event.dur + 0.1);
    handle.track(osc);
  }

  private sampleNote(voice: Voice, event: Extract<MidiEvent, { type: "note" }>, when: number, dest: GainNode): void {
    if (!this.ctx || !voice.sample) return;
    void (async () => {
      if (!this.ctx || !voice.sample) return;
      const file = this.samples?.[voice.sample as string];
      if (!file) return;
      let buffer = this.buffers.get(`sample:${file}`);
      if (!buffer) {
        try {
          buffer = await this.ctx.decodeAudioData(await (await fetch(`${AUDIO_ROOT}/samples/${file}`)).arrayBuffer());
          this.buffers.set(`sample:${file}`, buffer);
        } catch {
          return;
        }
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = Math.pow(2, (event.note - (voice.base || 60)) / 12);
      const gain = this.ctx.createGain();
      gain.gain.value = Math.max(0.001, (event.vel / 127) * 0.3);
      src.connect(gain);
      gain.connect(dest);
      src.start(when);
      src.stop(when + Math.min(event.dur + 0.3, buffer.duration / src.playbackRate.value));
    })();
  }

  private noiseBufferOf(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      // Browser noise stands in for the GBA PSG noise channel. Keep its stream
      // deterministic and local so audio setup never consumes the game's RNG.
      for (let i = 0; i < len; i++) {
        this.noiseSeed = (Math.imul(this.noiseSeed, 1103515245) + 24691) >>> 0;
        data[i] = (this.noiseSeed >>> 16) / 0x8000 - 1;
      }
    }
    return this.noiseBuffer;
  }

  private noiseNote(event: Extract<MidiEvent, { type: "note" }>, when: number, dur: number, dest: GainNode, freq: number): void {
    if (!this.ctx) return;
    const noise = this.noiseBufferOf();
    if (!noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, (event.vel / 127) * 0.25), when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.min(0.25, dur + 0.05));
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(when);
    src.stop(when + Math.min(0.3, dur + 0.1));
  }

  private drum(note: number, vel: number, when: number, dest: GainNode): void {
    // GBA drum kit approximation by MIDI note: kick/snare/hats/toms/cymbals.
    const fake = { channel: 9, note, vel: Math.round(vel * 127), dur: 0.2 } as Extract<MidiEvent, { type: "note" }>;
    if (note <= 35) this.noiseNote(fake, when, 0.25, dest, 150);
    else if (note <= 39) this.noiseNote(fake, when, 0.18, dest, 1800);
    else if (note <= 44) this.noiseNote(fake, when, 0.06, dest, 8000);
    else if (note <= 48) this.noiseNote(fake, when, 0.3, dest, 400);
    else this.noiseNote(fake, when, 0.4, dest, 6000);
  }
}

export function createM4aBackend(): SoundBackend {
  return new M4aBackend();
}
