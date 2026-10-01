// OfflineAudioContext validation for M4A voice/cry behavior.
// Run: node tools/playtest/pw.mjs "$PWD/tools/playtest/m4aAudio.job.mjs" /tmp/pw
// Measures rendered WebAudio output; it cannot validate subjective sound quality.
const SAMPLE_RATE = 44100;

async function render(ctx, seconds, build) {
  return ctx.runEval(`
    const M = await window.H.mod("/src/fr/audio/m4a.ts");
    const off = new OfflineAudioContext(1, Math.floor(${SAMPLE_RATE} * ${seconds}), ${SAMPLE_RATE});
    await (${build})(M, off);
    const d = (await off.startRendering()).getChannelData(0);
    const rms = (a, b) => Math.sqrt(d.slice(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
    const zcr = (a, b) => {
      let z = 0;
      for (let i = a + 1; i < b; i++) if ((d[i - 1] <= 0) !== (d[i] <= 0)) z++;
      return z / ((b - a) / ${SAMPLE_RATE});
    };
    const a = 5000, b = 10000;
    let over = 0;
    for (let i = a; i < b; i++) if (d[i] > 0.05) over++;
    return { steadyOver: over / (b - a), rmsEarly: rms(900, 1800), rmsLate: rms(10000, 12000),
      rmsLongLate: d.length > 45000 ? rms(44100, 45000) : null,
      zcrSweepEarly: zcr(530, 790), zcrSweepLate: zcr(16000, 20000) };
  `);
}

function noteBuilder({ note = 69, duty = 2, attack = 0, decay = 0, sustain = 15, sweep = 0, dur = 0.45 } = {}) {
  return `async (M, off) => {
    const backend = new M.M4aBackend();
    backend.ctx = off;
    const destination = off.createGain(); destination.connect(off.destination);
    const voice = { kind: "voice_square_1", base: 60, pan: 0, sweep: ${sweep}, duty: ${duty}, attack: ${attack}, decay: ${decay}, sustain: ${sustain}, release: 0 };
    backend.playNote({ destination: () => destination,
      currentData: () => ({ entry: { volume: 100, voicegroup: 0 }, voices: [voice] }),
      programOf: () => 0, track: () => {} },
      { time: 0, type: "note", channel: 0, note: ${note}, vel: 100, dur: ${dur} }, 0.01);
  }`;
}

export default async function run(ctx) {
  await ctx.loadSave("pewter");
  const duty25 = await render(ctx, 0.5, noteBuilder({ duty: 1 }));
  const duty50 = await render(ctx, 0.5, noteBuilder({ duty: 2 }));
  const attackSlow = await render(ctx, 0.5, noteBuilder({ attack: 7 }));
  const attackFast = await render(ctx, 0.5, noteBuilder({ attack: 0 }));
  const decay = await render(ctx, 1.8, noteBuilder({ attack: 0, decay: 3, sustain: 0, dur: 1.5 }));
  const sweep = await render(ctx, 0.5, noteBuilder({ note: 48, sweep: 0x11 }));

  const reverbEnergy = await ctx.runEval(`
    const M = await window.H.mod("/src/fr/audio/m4a.ts");
    const off = new OfflineAudioContext(1, ${SAMPLE_RATE}, ${SAMPLE_RATE});
    const send = M.buildReverbSend(off, 50);
    const src = off.createBufferSource();
    src.buffer = off.createBuffer(1, 100, ${SAMPLE_RATE});
    src.buffer.getChannelData(0).fill(1);
    src.connect(send.input); send.wet.connect(off.destination); src.start(0);
    const d = (await off.startRendering()).getChannelData(0);
    let energy = 0;
    for (let i = 20000; i < d.length; i++) energy += d[i] * d[i];
    return energy / (d.length - 20000);
  `);

  const keysplit = await ctx.runEval(`
    const M = await window.H.mod("/src/fr/audio/m4a.ts");
    const [voiceData, tableData] = await Promise.all([
      fetch("/fr/audio/voicegroups.json").then((r) => r.json()),
      fetch("/fr/audio/keysplit_tables.json").then((r) => r.json()),
    ]);
    const resolved = M.resolveVoice(voiceData.groups, tableData, 12, 1, 69);
    return { program: resolved.program, kind: resolved.voice.kind };
  `);

  const cry = await ctx.runEval(`
    const M = await window.H.mod("/src/fr/audio/m4a.ts");
    const backend = new M.M4aBackend();
    backend.ctx = new OfflineAudioContext(1, ${SAMPLE_RATE} * 3, ${SAMPLE_RATE});
    backend.out = backend.ctx.createGain(); backend.out.connect(backend.ctx.destination);
    // Encounter mode enables two-track chorus in sound.c PlayCryInternal.
    backend.playCry(25, 2, 0, 120, 10);
    backend.playCry(26, 2, 0, 120, 10);
    backend.playCry(27, 2, 0, 120, 10);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return { slots: backend.crySlots.filter(Boolean).length, voices: backend.cryVoiceCount(), playing: backend.isCryPlaying() };
  `);

  const failures = [];
  if (Math.abs(duty25.steadyOver - duty50.steadyOver) < 0.02) failures.push("square duty cycles render indistinguishably");
  if (!(attackFast.rmsEarly > attackSlow.rmsEarly * 5)) failures.push("ADSR attack did not change early RMS");
  if (!(decay.rmsEarly > decay.rmsLongLate * 5)) failures.push("ADSR decay did not lower sustained RMS");
  if (!(sweep.zcrSweepLate > sweep.zcrSweepEarly * 1.05)) failures.push("NR10 sweep did not raise rendered frequency");
  if (!(reverbEnergy > 1e-10)) failures.push("reverb feedback tail was not rendered");
  if (keysplit.program !== 1 || keysplit.kind !== "voice_directsound") failures.push("voice_keysplit did not resolve the C table");
  if (cry.slots !== 2 || cry.voices !== 4 || !cry.playing) failures.push("cry player arbitration/chorus must occupy two players and four tracks");
  if (ctx.errors().length) failures.push("browser reported WebAudio errors");
  if (failures.length) throw new Error(failures.join("; "));

  return { duty25: duty25.steadyOver, duty50: duty50.steadyOver,
    attackFastEarlyRms: attackFast.rmsEarly, attackSlowEarlyRms: attackSlow.rmsEarly,
    decayEarlyRms: decay.rmsEarly, decayLateRms: decay.rmsLongLate,
    sweepEarlyZcr: sweep.zcrSweepEarly, sweepLateZcr: sweep.zcrSweepLate,
    reverbTailEnergy: reverbEnergy, keysplit, cry, browserErrors: ctx.errors() };
}
