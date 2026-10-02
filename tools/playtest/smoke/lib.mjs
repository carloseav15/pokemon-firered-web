// Shared in-page helpers for the smoke jobs. `prelude` is prepended to runEval code;
// it defines `names()` (active task names), `until(pred, btn, max)` and `snap()`.
export const prelude = `
  const T = await H.mod("/src/fr/gba/tasks.ts");
  const sv = frDebug.save.save;
  const names = () => T.tasks.tasks.filter(t => t.isActive).map(t => t.func.name);
  const has = (n) => names().includes(n);
  // Press \`btn\` (or nothing) every few frames until pred() holds; false on timeout.
  const until = async (pred, btn = "A", max = 400) => {
    for (let i = 0; i < max; i++) {
      if (pred()) return true;
      if (btn) await frDebug.press(btn, 4);
      await frDebug.wait(8);
    }
    return pred();
  };
  const BTN = { A: 1, B: 2, SELECT: 4, START: 8, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
  // One clean key tap: held two frames, released, then settled (menus read edges).
  const tap = async (b, settle = 14) => { await frDebug.wait(2, BTN[b]); await frDebug.wait(settle); };
  // Open START (cursor reset to the top, like a fresh menu) and choose entry \`idx\` with real taps.
  const openStart = async (idx) => {
    window.frGame.startMenuCursor = 0;
    // The field must be free (fade done, no script, no menu task) before START counts.
    for (let i = 0; i < 400 && (H.st().locked || H.st().script || window.frGame.scene); i++) await frDebug.wait(10);
    await tap("START", 60);
    if (!has("startInput")) throw new Error("START menu did not open: " + names());
    for (let i = 0; i < idx; i++) await tap("D", 10);
    await tap("A", 10);
  };
  const cb2name = () => H.cb2() ?? null;
  // FNV-1a over the game canvas: detects that a screen actually redrew.
  const canvasHash = () => {
    const c = document.querySelector("canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
    return h;
  };
  const bagCount = (item) => Object.values(sv.bag).flat().filter(x => x.item === item).reduce((a, x) => a + x.quantity, 0);
`;
