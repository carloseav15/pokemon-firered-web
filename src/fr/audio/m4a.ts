// m4a.c / sound.c playback backend on WebAudio. Songs play from the exported
// standard MIDI sources with voice_groups.inc timbres (square/duty/sweep,
// keysplit, direct-sound samples, noise drums), per-song reverb sends and
// M4A-mapped ADSR envelopes; cries play from the exported PCM wavs through the
// 2-player SetPokemonCryTone arbitration with chorus detune tracks.
// Music loops, one-shots don't. Browsers require a user gesture before audio
// starts, so playback begins on the first input.
//
// Fidelity notes (documented approximations, see m4a.c):
// - Envelope step times use the hardware 1/64 s envelope rate from the CGB
//   engine ("keep up with the hardware envelope rate (1/64 s)"); direct-sound
//   full-byte rates map proportionally onto <=0.4 s.
// - Square duty uses PeriodicWave (12.5/25/50/75%); sweep decodes the NR10
//   byte (pace 0 disables, as on hardware).
// - Reverb is a feedback-delay wet send scaled by the song's reverb value
//   (SOUND_MODE_REVERB_VAL), standing in for the GBA mixer reverb.
// - Cry chorus doubles the track by the signed key delta added to tuneValue2
//   ((chorus + tuneValue) & 0x7F; scale-table steps are semitones).
// - Cry length counts 1/60 s units; WAV playback/reverse remains sample-based.

import { DATA_ROOT } from "../rom";
import * as C from "../generated/constants";
import type { PokemonCrySettings, SoundBackend } from "./sound";

const AUDIO_ROOT = `${DATA_ROOT}/audio`;

type SongEntry = {
  id: number; name: string; midi: string | null; player: number;
  voicegroup: number; volume: number; reverb: number; priority: number;
};

type Voice = {
  kind: string; base: number; pan: number; sample?: string;
  attack: number; decay: number; sustain: number; release: number;
  sweep?: number; duty?: number; period?: number; group?: string; table?: string; wave?: string;
};

export type KeysplitTable = { start: number; values: number[] };

// ---------------------------------------------------------------------------
// M4A tone semantics (m4a.c, asm/macros/music_voice.inc). Pure helpers so the
// mapping stays testable without an AudioContext.
// ---------------------------------------------------------------------------

const groupKey = (group: number): string => `voicegroup${String(group).padStart(3, "0")}`;

/** Keysplit sub-program for a note (voice_keysplit, TONEDATA_TYPE_SPL). */
export function keysplitSubProgram(table: KeysplitTable, note: number): number | null {
  const sub = table.values[(note | 0) - (table.start | 0)];
  return sub === undefined ? null : sub;
}

/**
 * Resolve a voicegroup program for a note. voice_keysplit indexes its table;
 * voice_keysplit_all (TONEDATA_TYPE_RHY) indexes its group from MIDI note 36,
 * matching the exported group sizes (e.g. 90 entries cover 36-125). Returns
 * the resolved voice and program; unresolved notes keep the raw program so the
 * caller falls back to its default timbre.
 */
export function resolveVoice(
  groups: Record<string, Voice[]>, tables: Record<string, KeysplitTable>,
  group: number, program: number, note: number,
): { voice: Voice; program: number } | undefined {
  const list = groups[groupKey(group)];
  const voice = list?.[program];
  if (!voice) return undefined;
  if (voice.kind === "voice_keysplit" && voice.group && voice.table) {
    const table = tables[voice.table];
    const target = groups[voice.group];
    const sub = table ? keysplitSubProgram(table, note) : null;
    const resolved = sub !== null ? target?.[sub] : undefined;
    if (resolved) return { voice: resolved, program: sub! };
    return { voice, program };
  }
  if (voice.kind === "voice_keysplit_all" && voice.group) {
    const target = groups[voice.group];
    const resolved = target?.[(note | 0) - 36];
    if (resolved) return { voice: resolved, program: (note | 0) - 36 };
    return { voice, program };
  }
  return { voice, program };
}

/** Square duty cycle fractions (duty & 0x3 per music_voice.inc). */
export const DUTY_FRACTIONS = [0.125, 0.25, 0.5, 0.75];

/**
 * Decode an NR10 sweep byte. Pace 0 disables the sweep on hardware, so it maps
 * to null; otherwise an approximate pitch slide is returned.
 */
export function nr10Sweep(sweep: number): { semitones: number; time: number } | null {
  const sw = Math.trunc(sweep) & 0xff;
  const pace = (sw >> 4) & 0x7;
  const shift = sw & 0x7;
  if (sw === 0 || pace === 0 || shift === 0) return null;
  const delta = shift === 0 ? 1 : 1 / (2 ** shift);
  const ratio = (sw & 0x8) !== 0 ? 1 - delta : 1 + delta;
  return { semitones: 12 * Math.log2(ratio), time: pace / 128 };
}

export type EnvelopePlan = { attackTime: number; decayTime: number; sustainLevel: number; releaseTime: number };

/** Hardware envelope step rate from the m4a.c CGB engine (1/64 s per step). */
const ENVELOPE_STEP = 1 / 64;

/**
 * Map M4A voice envelope fields onto a WebAudio gain plan. CGB-style voices
 * (square/noise/programmable) carry 3-bit step counts and a 4-bit sustain
 * level (music_voice.inc masks); direct-sound voices carry full-byte rates
 * with 0xFF meaning instantaneous (the cry macro uses attack/sustain 0xFF).
 */
export function envelopePlan(
  kind: string | undefined, attack: number, decay: number, sustain: number, release: number, peak: number,
): EnvelopePlan {
  const toNum = (v: number): number => (typeof v === "number" ? v : Number(v));
  const A = toNum(attack) || 0, D = toNum(decay) || 0, R = toNum(release) || 0;
  const S = toNum(sustain);
  const level = Number.isFinite(S) ? S : peak > 0 ? 15 : 0;
  if (kind === "voice_directsound" || kind === "voice_directsound_no_resample" || kind === "voice_directsound_alt"
    || kind === "voice_directsound_reverse") {
    return {
      attackTime: A >= 0xff ? 0.005 : (A / 255) * 0.3,
      decayTime: (D / 255) * 0.3,
      sustainLevel: peak * (level / 255),
      releaseTime: R >= 0xff || R === 0 ? 0.03 : Math.max(0.03, (R / 255) * 0.4),
    };
  }
  const sustainGoal = ((15 * (level & 0xf) + 15) >> 4);
  return {
    // C increments/decrements the 0..15 envelope by one at each counter
    // expiry; attack/decay/release values are per-step periods, not phase
    // durations. sustainGoal uses CgbModVol's rounded /16 expression.
    attackTime: (A & 0x7) === 0 ? 0.005 : ((A & 0x7) * ENVELOPE_STEP * 15),
    decayTime: (D & 0x7) * ENVELOPE_STEP * (15 - sustainGoal),
    sustainLevel: peak * (sustainGoal / 15),
    releaseTime: (R & 0x7) === 0 ? 0.03 : ((R & 0x7) * ENVELOPE_STEP * 15),
  };
}

/** Shape a note gain through an EnvelopePlan starting at `when` over `dur` seconds. */
export function shapeNoteGain(node: GainNode, plan: EnvelopePlan, peak: number, when: number, dur: number): void {
  const gain = node.gain;
  const attackEnd = when + Math.min(plan.attackTime, Math.max(0.004, dur * 0.5));
  const noteEnd = when + Math.max(0.004, dur);
  const decayEnd = Math.min(noteEnd, attackEnd + plan.decayTime);
  gain.setValueAtTime(0.0001, when);
  gain.exponentialRampToValueAtTime(Math.max(0.0011, peak), attackEnd);
  gain.setValueAtTime(Math.max(0.0011, peak), attackEnd);
  gain.linearRampToValueAtTime(Math.max(0.0001, plan.sustainLevel), decayEnd);
  gain.setValueAtTime(Math.max(0.0001, plan.sustainLevel), noteEnd);
  gain.exponentialRampToValueAtTime(0.0001, noteEnd + plan.releaseTime + 0.02);
}

export type CryModeParams = {
  length: number; release: number; pitch: number; chorus: number; volume: number; reverse: boolean;
};

/** PlayCryInternal mode table (sound.c): length counts 1/60 s units. */
export function cryModeParams(mode: number): CryModeParams {
  const p: CryModeParams = { length: 140, release: 0, pitch: 15360, chorus: 0, volume: 120, reverse: false };
  switch (mode) {
    case C.CRY_MODE_DOUBLES: p.length = 20; p.release = 225; break;
    case C.CRY_MODE_ENCOUNTER: p.release = 225; p.pitch = 15600; p.chorus = 20; p.volume = 90; break;
    case C.CRY_MODE_HIGH_PITCH: p.length = 50; p.release = 200; p.pitch = 15800; p.chorus = 20; p.volume = 90; break;
    case C.CRY_MODE_ECHO_START:
      p.length = 25; p.reverse = true; p.release = 100; p.pitch = 15600; p.chorus = 192; p.volume = 90; break;
    case C.CRY_MODE_FAINT: p.release = 200; p.pitch = 14440; break;
    case C.CRY_MODE_ECHO_END:
      p.release = 220; p.pitch = 15555; p.chorus = 192; p.volume = 90; break;
    case C.CRY_MODE_ROAR_1: p.length = 10; p.release = 100; p.pitch = 14848; break;
    case C.CRY_MODE_ROAR_2: p.length = 60; p.release = 225; p.pitch = 15616; break;
    case C.CRY_MODE_GROWL_1:
      p.length = 15; p.reverse = true; p.release = 125; p.pitch = 15200; break;
    case C.CRY_MODE_GROWL_2: p.length = 100; p.release = 225; p.pitch = 15200; break;
    case C.CRY_MODE_WEAK_DOUBLES: p.length = 20; p.release = 225; p.pitch = 15000; break;
    case C.CRY_MODE_WEAK: p.pitch = 15000; break;
    default: break;
  }
  return p;
}

/**
 * Build a song reverb wet send (SOUND_MODE_REVERB_VAL): the song gain feeds a
 * feedback delay whose output mixes back before the volume control.
 */
export function buildReverbSend(ctx: BaseAudioContext, amount: number): {
  input: GainNode; wet: GainNode; nodes: AudioNode[];
} {
  const input = ctx.createGain();
  input.gain.value = 1;
  const delay = ctx.createDelay(0.3);
  delay.delayTime.value = 0.09;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = Math.min(0.5, (Math.max(0, amount) / 127) * 0.4);
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  return { input, wet, nodes: [input, delay, feedback, wet] };
}

/** Chorus detune in cents from the tuneValue2 arithmetic ((chorus + tune) & 0x7F). */
export function chorusDetuneCents(chorus: number): number {
  // SetPokemonCryChorus(s8 val) stores (val + tuneValue) & 0x7F. The GBA scale
  // table advances one semitone per key unit; preserve s8 sign before mapping.
  return ((Math.trunc(chorus) << 24) >> 24) * 100;
}

export type CrySlotState = { clock: number } | null;

/**
 * Pick a cry player (SetPokemonCryTone, m4a.c): a free player first, else the
 * longest-playing one (max clock) is stolen.
 */
export function pickCrySlot(slots: Array<CrySlotState>): number {
  const free = slots.findIndex((s) => s === null);
  if (free >= 0) return free;
  let idx = 0;
  for (let i = 1; i < slots.length; i++) if ((slots[i]?.clock ?? 0) > (slots[idx]?.clock ?? 0)) idx = i;
  return idx;
}

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
  private reverbNodes: AudioNode[] = [];
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
    // Song reverb (SOUND_MODE_REVERB_VAL): feedback-delay wet send in parallel.
    if (data.entry.reverb > 0) {
      const send = buildReverbSend(this.backend.ctx!, data.entry.reverb);
      this.reverbNodes = send.nodes;
      this.gain.connect(send.input);
      send.wet.connect(this.volumeControl);
    }
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
    for (const node of this.reverbNodes) {
      try { node?.disconnect(); } catch { /* disconnected */ }
    }
    this.reverbNodes = [];
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
  private keysplit: Record<string, KeysplitTable> | null = null;
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
  /** Cry players (MAX_POKEMON_CRIES = 2, m4a.c); each holds its live sources. */
  private readonly crySlots: Array<{ sources: AudioBufferSourceNode[]; clock: number; priority: number } | null> = [null, null];
  private readonly cryPending = new Set<object>();
  private cryLoading = false;
  private cryClock = 0;
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
    if (this.ctx.state === "suspended" && this.ctx.constructor.name !== "OfflineAudioContext") void this.ctx.resume();
    return this.ctx;
  }

  private async tables(): Promise<boolean> {
    if (this.songs) return true;
    try {
      const [songs, voices, samples, cries, keysplit] = await Promise.all([
        fetch(`${AUDIO_ROOT}/songs.json`).then((r) => r.json()),
        fetch(`${AUDIO_ROOT}/voicegroups.json`).then((r) => r.json()),
        fetch(`${AUDIO_ROOT}/samples.json`).then((r) => r.json()),
        fetch(`${AUDIO_ROOT}/cries.json`).then((r) => r.json()),
        fetch(`${AUDIO_ROOT}/keysplit_tables.json`).then((r) => r.json()).catch(() => ({})),
      ]);
      this.songs = songs.songs as SongEntry[];
      this.voices = voices.groups as Record<string, Voice[]>;
      this.samples = samples.samples as Record<string, string>;
      this.cries = cries.order as Array<string | null>;
      this.keysplit = keysplit as Record<string, KeysplitTable>;
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

  playCry(cryId: number, mode: number, pan = 0, volume = 120, priority = 10, settings?: PokemonCrySettings): void {
    if (!this.ensure() || !this.ctx || !this.out) return;
    // Reserve the cry player synchronously (SetPokemonCryTone picks a free
    // player, else the longest-playing one); the async load below fills it.
    const slot = pickCrySlot(this.crySlots.map((s) => (s ? { clock: s.clock } : null)));
    const prev = this.crySlots[slot];
    // MPlayStart accepts a replacement only when the incoming priority is at
    // least the running player's priority (m4a.c: MPlayStart).
    if (prev && prev.priority > priority) return;
    if (prev) for (const src of prev.sources) { try { src.stop(); } catch { /* stopped */ } }
    const slotSources: AudioBufferSourceNode[] = [];
    const slotClock = ++this.cryClock;
    this.crySlots[slot] = { sources: slotSources, clock: slotClock, priority };
    const pending = {};
    this.cryPending.add(pending);
    this.cryLoading = this.cryPending.size > 0;
    void (async () => {
      const releasePending = (keepReservedSlot = false): boolean => {
        this.cryPending.delete(pending);
        this.cryLoading = this.cryPending.size > 0;
        // Abandoned if a newer cry stole this slot meanwhile.
        const ownsSlot = this.crySlots[slot]?.clock === slotClock;
        if (ownsSlot && !keepReservedSlot && slotSources.length === 0) this.crySlots[slot] = null;
        return ownsSlot;
      };
      if (!(await this.tables())) {
        releasePending();
        return;
      }
      const file = this.cries?.[cryId]; // gCryTable index (SpeciesToCryId(species - 1)), as sound.c
      if (!file || !this.ctx || !this.out) {
        releasePending();
        return;
      }
      let buffer = this.buffers.get(`cry:${file}`);
      if (!buffer) {
        try {
          buffer = await this.ctx.decodeAudioData(await (await fetch(`${AUDIO_ROOT}/cries/${file}`)).arrayBuffer());
          this.buffers.set(`cry:${file}`, buffer);
        } catch {
          releasePending();
          return;
        }
      }
      if (!releasePending(true)) return;
      // Full PlayCryInternal mode table (sound.c); settings override pitch,
      // length, release, chorus and direction for scripted cries.
      const params = cryModeParams(mode);
      const rate = (settings?.pitch ?? params.pitch) / 15360;
      const modeVolume = settings ? volume : mode === C.CRY_MODE_ENCOUNTER || mode === C.CRY_MODE_HIGH_PITCH
        || mode === C.CRY_MODE_ECHO_START || mode === C.CRY_MODE_ECHO_END ? 90 : volume;
      const reverse = settings?.reverse ?? params.reverse;
      const playLen = settings ? (settings.length & 0xffff) / 60 : params.length / 60;
      const playRelease = settings ? (settings.release & 0xff) / 60 : params.release / 60;
      const chorus = settings?.chorus ?? params.chorus;
      const startVoice = (detuneCents: number, peak: number): void => {
        if (!this.ctx || !this.out) return;
        const src = this.ctx.createBufferSource();
        src.buffer = reverse ? this.reversedCryBuffer(file, buffer!) : buffer!;
        src.playbackRate.value = rate;
        if (detuneCents !== 0) src.detune.value = detuneCents;
        const gain = this.ctx!.createGain();
        gain.gain.value = Math.max(0, Math.min(1, peak / 127));
        const panner = this.ctx!.createStereoPanner();
        panner.pan.value = this.panValue(pan);
        src.connect(gain);
        gain.connect(panner);
        panner.connect(this.out!);
        const dur = buffer!.duration / rate;
        const play = Math.min(dur, playLen);
        const now = this.ctx!.currentTime;
        const release = Math.min(play, playRelease);
        if (release > 0) {
          gain.gain.setValueAtTime(gain.gain.value, now + play - release);
          gain.gain.linearRampToValueAtTime(0, now + play);
        }
        slotSources.push(src);
        src.onended = () => {
          const i = slotSources.indexOf(src);
          if (i >= 0) slotSources.splice(i, 1);
          if (slotSources.length === 0 && this.crySlots[slot]?.sources === slotSources) this.crySlots[slot] = null;
        };
        src.start();
        src.stop(this.ctx!.currentTime + play + 0.05);
      };
      startVoice(0, modeVolume);
      // Cry chorus (SetPokemonCryChorus): a second track detuned by the
      // tuneValue2 arithmetic, at the same volume as the lead track.
      if (chorus !== 0) startVoice(chorusDetuneCents(chorus), modeVolume);
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
    return !!this.ctx && (this.cryLoading || this.crySlots.some((s) => s !== null));
  }

  stopCry(): void {
    this.cryPending.clear();
    for (let i = 0; i < this.crySlots.length; i++) {
      const slot = this.crySlots[i];
      this.crySlots[i] = null;
      if (slot) for (const src of slot.sources) { try { src.stop(); } catch { /* stopped */ } }
    }
    this.cryLoading = false;
  }

  /** Live cry slot count for the headless audio validation. */
  cryVoiceCount(): number {
    let n = 0;
    for (const slot of this.crySlots) if (slot) n += slot.sources.length;
    return n;
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

  private readonly waveCache = new Map<number, PeriodicWave>();

  /** Square duty cycle as a PeriodicWave (duty & 0x3 per music_voice.inc). */
  private dutyWave(duty: number): PeriodicWave | null {
    if (!this.ctx) return null;
    const d = DUTY_FRACTIONS[Math.trunc(duty) & 0x3] ?? 0.5;
    let wave = this.waveCache.get(d);
    if (!wave) {
      // Fourier series of a pulse wave with the given duty cycle.
      const real = new Float32Array(25);
      const imag = new Float32Array(25);
      for (let n = 1; n < 25; n++) imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
      wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: true });
      this.waveCache.set(d, wave);
    }
    return wave;
  }

  /** voice_groups.inc pan is a 0..127 pan byte; zero means use the player pan. */
  private connectToneGain(gain: GainNode, dest: GainNode, tonePan: number): void {
    if (!this.ctx || tonePan === 0) {
      gain.connect(dest);
      return;
    }
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = this.panValue(Math.max(-64, Math.min(63, Math.trunc(tonePan) - 64)));
    gain.connect(panner);
    panner.connect(dest);
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
    const resolved = resolveVoice(
      this.voices ?? {}, this.keysplit ?? {}, data.entry.voicegroup, program, event.note,
    ) ?? (data.voices[program] !== undefined ? { voice: data.voices[program]!, program } : undefined);
    const fallback = resolved ?? { voice: this.voiceOf(data.entry.voicegroup, program), program };
    const voice = fallback.voice;
    const kind = voice?.kind ?? "square_1";
    if (kind.startsWith("voice_directsound") && voice?.sample) {
      this.sampleNote(voice, event, when, dest);
      return;
    }
    if (kind.startsWith("voice_noise")) {
      const noiseNote = kind === "voice_noise_alt" ? (voice?.base ?? event.note) : event.note;
      this.noiseNote(voice, event, when, event.dur, dest, 1000 + noiseNote * 40);
      return;
    }
    const fixed = kind === "voice_square_1_alt" || kind === "voice_square_2_alt"
      || kind === "voice_programmable_wave_alt" || kind === "voice_noise_alt";
    const freq = fixed ? midiFreq(voice?.base ?? 60) : midiFreq(event.note);
    const osc = this.ctx.createOscillator();
    if (kind.startsWith("voice_square")) {
      const wave = this.dutyWave(voice?.duty ?? 2);
      if (wave) osc.setPeriodicWave(wave);
      else osc.type = "square";
    } else {
      // Programmable wave data is not exported; triangle stands in.
      osc.type = "triangle";
    }
    osc.frequency.setValueAtTime(freq, when);
    if (!fixed) {
      const sweep = nr10Sweep(voice?.sweep ?? 0);
      if (sweep) osc.frequency.exponentialRampToValueAtTime(freq * Math.pow(2, sweep.semitones / 12), when + sweep.time);
    }
    const gain = this.ctx.createGain();
    const peak = Math.max(0.001, (event.vel / 127) * 0.22 * (data.entry.volume / 100));
    const plan = envelopePlan(kind, voice?.attack ?? 0, voice?.decay ?? 0, voice?.sustain ?? 15, voice?.release ?? 0, peak);
    shapeNoteGain(gain, plan, peak, when, event.dur);
    osc.connect(gain);
    this.connectToneGain(gain, dest, voice?.pan ?? 0);
    osc.start(when);
    osc.stop(when + event.dur + plan.releaseTime + 0.1);
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
      // voice_directsound_reverse (TONEDATA_TYPE_REV, pokeemerald's rs_sfx_2) plays the sample backwards
      src.buffer = voice.kind === "voice_directsound_reverse" ? this.reversedCryBuffer(`sample:${file}`, buffer) : buffer;
      const noResample = voice.kind === "voice_directsound_no_resample";
      src.playbackRate.value = noResample ? 1 : Math.pow(2, (event.note - (voice.base || 60)) / 12);
      const gain = this.ctx.createGain();
      const peak = Math.max(0.001, (event.vel / 127) * 0.3);
      const plan = envelopePlan(voice.kind, voice.attack, voice.decay, voice.sustain, voice.release, peak);
      shapeNoteGain(gain, plan, peak, when, event.dur);
      src.connect(gain);
      this.connectToneGain(gain, dest, voice.pan);
      src.start(when);
      src.stop(when + Math.min(event.dur + plan.releaseTime + 0.1, buffer.duration / src.playbackRate.value));
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

  private noiseNote(voice: Voice | undefined, event: Extract<MidiEvent, { type: "note" }>, when: number, dur: number, dest: GainNode, freq: number): void {
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
    const peak = Math.max(0.001, (event.vel / 127) * 0.25);
    const plan = envelopePlan(voice?.kind, voice?.attack ?? 0, voice?.decay ?? 0, voice?.sustain ?? 15, voice?.release ?? 0, peak);
    shapeNoteGain(gain, plan, peak, when, dur);
    src.connect(filter);
    filter.connect(gain);
    this.connectToneGain(gain, dest, voice?.pan ?? 0);
    src.start(when);
    src.stop(when + Math.min(0.3, dur + plan.releaseTime + 0.1));
  }

  private drum(note: number, vel: number, when: number, dest: GainNode): void {
    // GBA drum kit approximation by MIDI note: kick/snare/hats/toms/cymbals.
    const fake = { channel: 9, note, vel: Math.round(vel * 127), dur: 0.2 } as Extract<MidiEvent, { type: "note" }>;
    if (note <= 35) this.noiseNote(undefined, fake, when, 0.25, dest, 150);
    else if (note <= 39) this.noiseNote(undefined, fake, when, 0.18, dest, 1800);
    else if (note <= 44) this.noiseNote(undefined, fake, when, 0.06, dest, 8000);
    else if (note <= 48) this.noiseNote(undefined, fake, when, 0.3, dest, 400);
    else this.noiseNote(undefined, fake, when, 0.4, dest, 6000);
  }
}

export function createM4aBackend(): SoundBackend {
  return new M4aBackend();
}
