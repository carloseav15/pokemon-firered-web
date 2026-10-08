// The single driver loop: recognize() -> handler for that screen -> verify the effect of every input.
// A screen without a handler (including "unknown") stops the loop with the dump of the game state; nothing here
// presses a button "just in case". Every input goes through ctx.input(), which states what must be true afterwards
// (expect) and stops with a diagnosis if it is not. Handlers live in driver/handlers/*.js.
import { recognize, dump } from "./screens.js";

export const BUTTON = { A: 1, B: 2, SELECT: 4, START: 8, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };

/** A stop with a reason and the evidence collected where it happened. */
export class DriverStop extends Error {
  constructor(reason, info = {}) { super(reason); this.reason = reason; this.info = info; }
}

const frame = () => window.frGame?.frameCount ?? 0;

/** What must change while the game makes progress: the screen, its details, the script, the text printer, the battle. */
/** One verified press outside a drive (field interactions such as talking to an NPC). */
export function input(H, button, opts) { return makeCtx(H, { goal: null, state: {}, label: "input" }).input(button, opts); }

export function fingerprint(H, rec = recognize(H)) {
  const game = window.frGame, d = rec.raw, script = d?.script, printer = game?.overworld?.messageBox?.printer;
  const battle = d?.inBattle && H.G ? [H.G.G.gBattlescriptCurrInstr, d.controller, H.G.gBattleMons?.[0]?.hp, H.G.gBattleMons?.[1]?.hp] : null;
  const d1 = { ...rec.details }; delete d1.tasks;
  return JSON.stringify([rec.screen, d1, d?.cb2, d?.tasks, script?.scriptPtr ?? null, script?.nativePtr?.name ?? null,
    printer ? [printer.active, printer.state, printer.pos, printer.currentY] : null, d?.textWait, battle, d?.st?.x, d?.st?.y, d?.st?.map]);
}

/**
 * Run the loop until `until(rec, ctx)` returns something truthy (the result's `reason` is that value if it is a string).
 *   goal      what the current drive is for ({ kind: "use-item", ... }); handlers read it from ctx.goal.
 *   handlers  per-screen overrides merged over the defaults.
 *   waitLimit frames a waiting screen may show the same fingerprint before the drive stops as stuck.
 */
export async function drive(H, { until, goal = null, handlers = {}, maxFrames = 120000, waitLimit = 4800, label = "drive", state = {} } = {}) {
  const table = { ...(await import("./handlers/index.js")).DEFAULT_HANDLERS, ...handlers };
  const ctx = makeCtx(H, { goal, state, label });
  const t0 = frame();
  let lastFp = null, lastChange = frame(), iterations = 0;
  try {
    for (;;) {
      H.checkExecution();
      const rec = recognize(H);
      ctx.rec = rec;
      const done = until ? until(rec, ctx) : false;
      if (done) return { ok: true, reason: typeof done === "string" ? done : "done", rec, trace: ctx.trace, iterations, frames: frame() - t0 };
      if (frame() - t0 > maxFrames) throw new DriverStop("frame-budget", { screen: rec.screen, details: rec.details });
      const handler = table[rec.screen];
      if (!handler) throw new DriverStop(rec.screen === "unknown" ? "unknown-screen" : "no-handler", { screen: rec.screen, details: rec.details, dump: dump(H, rec.raw ?? undefined) });
      const fp = fingerprint(H, rec);
      if (fp !== lastFp) { lastFp = fp; lastChange = frame(); }
      else if (frame() - lastChange > waitLimit) throw new DriverStop("stuck", { screen: rec.screen, details: rec.details, unchangedFrames: frame() - lastChange, dump: dump(H, rec.raw ?? undefined) });
      iterations++;
      const out = await handler(ctx, rec);
      if (out?.stop) throw new DriverStop(out.stop, { screen: rec.screen, details: rec.details, ...out.info });
      if (out?.done) return { ok: true, reason: out.done, rec, trace: ctx.trace, iterations, frames: frame() - t0 };
    }
  } catch (e) {
    if (!(e instanceof DriverStop)) throw e;
    const rec = recognize(H);
    return { ok: false, status: "failure", reason: e.reason, ...e.info, rec: { screen: rec.screen, details: rec.details }, trace: ctx.trace, iterations, frames: frame() - t0,
      note: e.reason, dump: e.info?.dump ?? dump(H, rec.raw ?? undefined) };
  }
}

function makeCtx(H, { goal, state, label }) {
  const ctx = {
    H, label, goal, state, trace: [], rec: null, policy: H.policy,
    /** Advance frames with no input. */
    async wait(frames = 4) { await H.wait(frames); },
    /**
     * Press one button and verify the effect. `expect(rec, before)` must hold within `within` frames, else the drive
     * stops ("no-effect"); `fail(rec)` stops early with its string when a wrong screen shows up. A is never sent without
     * an expectation: that is what keeps a blind "press A" from coming back.
     */
    async input(button, { expect, fail, within = 150, settle = 3, retry = 0, label: what = null } = {}) {
      const bits = BUTTON[button];
      if (!bits) throw new Error("unsupported button " + button);
      if (typeof expect !== "function") throw new Error(`input(${button}) needs an expect() postcondition`);
      const before = recognize(H), fp0 = fingerprint(H, before);
      // `retry` re-sends the same press when a menu is still ignoring input (fade-in, first frames of a task): only
      // after the whole `within` window passed without the effect, never earlier.
      for (let attempt = 0; attempt <= retry; attempt++) {
        await H.tap(bits, settle);
        for (let f = 0; f <= within; f++) {
          const rec = recognize(H);
          const bad = fail?.(rec, before);
          if (bad) throw new DriverStop(bad, { button, from: before.screen, screen: rec.screen, details: rec.details });
          if (expect(rec, before, fingerprint(H, rec) !== fp0)) return rec;
          await H.wait(1);
        }
      }
      const rec = recognize(H);
      throw new DriverStop("no-effect", { button, what, from: before.screen, fromDetails: before.details, screen: rec.screen, details: rec.details, dump: dump(H, rec.raw ?? undefined) });
    },
    /**
     * A direction press whose cursor the game does not expose (the forget-move summary keeps it in a private variable).
     * Only directions: A/B/START must always state a postcondition through input().
     */
    async unobserved(button, why, settle = 20) {
      if (!["U", "D", "L", "R"].includes(button) || !why) throw new Error("unobserved() is for documented direction presses only");
      await H.tap(BUTTON[button], settle);
    },
    /** Move a cursor with one verified direction press per step: `read()` must change to the next cell. */
    async cursorTo(want, read, dirFor, { limit = 12 } = {}) {
      for (let i = 0; i < limit; i++) {
        const cur = read();
        if (cur === want) return true;
        const dir = dirFor(cur, want);
        await ctx.input(dir.button, { expect: () => read() !== cur, retry: 2, label: `cursor ${cur} -> ${want}` });
      }
      if (read() !== want) throw new DriverStop("cursor-not-reached", { want, at: read() });
      return true;
    },
  };
  return ctx;
}
