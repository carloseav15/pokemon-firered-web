// Phase-one input replay, not a savestate or a complete-engine determinism guarantee.
// The observation scope is frDebug.snapshot() version 1 (no full battle, sprites or audio).
import { launchFireRed } from "/src/fr/boot.ts";
import { SANDBOX_STORAGE_KEY } from "/src/fr/save.ts";

const VERSION = 1;
const OBSERVATION = "frDebug.snapshot/v1";
const debug = () => {
  const d = window.frDebug;
  if (d?.executionMode !== "manual") throw new Error("Replay requires a fresh manual test session");
  return d;
};
const encode = value => JSON.stringify(value);
async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encode(value)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** PREPARED bootstrap: initial map/help data loaded at boot, then exactly 120 empty frames by default.
 * Later asynchronous loads and browser audio clocks remain outside the phase-one contract. */
export async function launch({ timer1Low = 12345, mode = "new", saveRaw = null, bootstrapFrames = 120 } = {}) {
  if (window.frGame) throw new Error("Replay launch requires a fresh page");
  if (!["new", "continue"].includes(mode)) throw new Error("Replay entry must be new or continue");
  if (!Number.isInteger(bootstrapFrames) || bootstrapFrames < 0 || bootstrapFrames > 18000) throw new Error("Invalid bootstrap frame count");
  if (mode === "continue") {
    if (typeof saveRaw !== "string") throw new Error("Continue requires explicit save bytes");
    const data = JSON.parse(saveRaw);
    if (!Array.isArray(data.party) || !data.location || !data.pos) throw new Error("Invalid continue save");
    localStorage.setItem(SANDBOX_STORAGE_KEY, saveRaw);
  }
  const entry = { mode, timer1Low, saveRaw, bootstrapFrames };
  await launchFireRed(mode === "new"
    ? { mode, playerName: "RED", gender: 0, rivalName: "GREEN", test: { timer1Low } }
    : { mode, test: { timer1Low } });
  await debug().wait(bootstrapFrames);
  return entry;
}

function validate(replay) {
  if (replay?.version !== VERSION || replay.observation !== OBSERVATION) throw new Error("Unsupported replay/observation version");
  if (!Number.isInteger(replay.startFrame) || replay.startFrame < 0 || !Number.isInteger(replay.timer1Low) || replay.timer1Low < 0 || replay.timer1Low > 0xffff)
    throw new Error("Invalid replay entry");
  if (!Array.isArray(replay.inputs) || !replay.inputs.every(b => Number.isInteger(b) && b >= 0 && b <= 0x3ff)) throw new Error("Invalid replay input mask");
  if (!Array.isArray(replay.hashes) || replay.hashes.length !== replay.inputs.length || !replay.hashes.every(h => /^[a-f0-9]{64}$/.test(h))) throw new Error("Invalid replay trace");
  if (!/^[a-f0-9]{64}$/.test(replay.initialHash) || !replay.initialState) throw new Error("Missing replay initial observation");
  if (replay.initialState.random?.generatedTrainerIdLower !== replay.timer1Low || replay.initialState.execution?.frame !== replay.startFrame || !replay.initialState.execution?.manualFrames)
    throw new Error("Replay header differs from its initial observation");
}

/** Record actual injected masks, including empty frames, and a SHA-256 observation after each frame. */
export async function record(inputs) {
  if (!Array.isArray(inputs) || !inputs.every(b => Number.isInteger(b) && b >= 0 && b <= 0x3ff)) throw new Error("Invalid input schedule");
  const d = debug(), hashes = [];
  d.beginRecording();
  let recording;
  try {
    for (const bits of inputs) {
      const before = window.frGame.frameCount;
      d.run(1, bits);
      hashes.push(await hash(d.snapshot()));
      if (window.frGame.frameCount !== before + 1) throw new Error("Frame drift while recording");
    }
  } finally { recording = d.endRecording(); }
  return { ...recording, observation: OBSERVATION, initialHash: await hash(recording.initialState), hashes };
}

/** Start from an independently reconstructed entry. Reject a different initial state; never manufacture it. */
export async function play(replay) {
  validate(replay);
  const d = debug(), initialState = d.snapshot(), initialHash = await hash(initialState);
  if (await hash(replay.initialState) !== replay.initialHash) throw new Error("Replay initial observation hash differs");
  if (initialHash !== replay.initialHash || window.frGame.frameCount !== replay.startFrame)
    return { ok: false, reason: "initial-state-mismatch", frame: window.frGame.frameCount, expectedHash: replay.initialHash, actualHash: initialHash, state: initialState };
  for (let i = 0; i < replay.inputs.length; i++) {
    const before = window.frGame.frameCount;
    d.run(1, replay.inputs[i]);
    const state = d.snapshot(), actualHash = await hash(state);
    if (window.frGame.frameCount !== before + 1)
      return { ok: false, reason: "frame-drift", inputIndex: i, before, after: window.frGame.frameCount };
    if (actualHash !== replay.hashes[i])
      return { ok: false, reason: "state-divergence", inputIndex: i, frame: before + 1, expectedHash: replay.hashes[i], actualHash, input: replay.inputs[i], state };
  }
  return { ok: true, frames: replay.inputs.length, firstFrame: replay.startFrame + 1, lastFrame: window.frGame.frameCount,
    finalHash: replay.hashes.at(-1) ?? initialHash, observation: OBSERVATION };
}
