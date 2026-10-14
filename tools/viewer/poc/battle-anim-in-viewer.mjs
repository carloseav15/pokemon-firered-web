// Prueba de concepto (2026-10-14): el motor de batalla del port corre en una página web y reproduce la animación real
// de un movimiento, controlado desde fuera. No modifica src/.
//
// Uso (con el servidor de desarrollo en marcha):
//   BASE=http://localhost:5173 MOVE=MOVE_EMBER node tools/viewer/poc/battle-anim-in-viewer.mjs
// Escribe capturas en $OUT (por defecto /tmp/battle-anim-poc).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const MOVE = process.env.MOVE ?? "MOVE_EMBER";
const ATTACKER = process.env.ATTACKER ?? "SPECIES_CHARMANDER";
const TARGET = process.env.TARGET ?? "SPECIES_PIDGEY";
const OUT = process.env.OUT ?? "/tmp/battle-anim-poc";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));

await page.goto(`${BASE}/?fr=sandbox`);
await page.waitForFunction(() => !!window.frDebug, null, { timeout: 180000 });
await page.evaluate(async ([a, t]) => {
  const d = window.frDebug;
  await d.wait(120);
  const { createMon } = await import("/src/core/pokemon/pokemon.ts");
  d.save.save.party.length = 0;
  d.save.save.party.push(createMon(d.rom.c(a), 10));
  d.game.battleSetup.StartWildBattle(createMon(d.rom.c(t), 5));
  await d.wait(1500); // presentación del combate (el atacante aún puede no estar en pantalla)
}, [ATTACKER, TARGET]);

await page.evaluate(async (move) => {
  const anim = await import("/src/core/battle/anim.ts");
  const g = await import("/src/core/battle/globals.ts");
  g.G.gBattlerAttacker = 0;
  g.G.gBattlerTarget = 1;
  anim.DoMoveAnim(window.frDebug.rom.c(move)); // lo mismo que hace PlayerDoMoveAnimation (controller_player.ts)
  window.__anim = anim;
}, MOVE);

const canvas = page.locator("canvas").first();
let frames = 0;
for (let i = 0; i < 40; i++) {
  const active = await page.evaluate(() => {
    const d = window.frDebug, a = window.__anim;
    for (let k = 0; k < 8; k++) {
      if (a.animState.gAnimScriptActive) a.animState.gAnimScriptCallback();
      d.run(1);
    }
    return a.animState.gAnimScriptActive;
  });
  frames += 8;
  await canvas.screenshot({ path: `${OUT}/${MOVE}_${String(i).padStart(2, "0")}.png` });
  if (!active) break;
}
console.log(JSON.stringify({ move: MOVE, attacker: ATTACKER, target: TARGET, frames, errors }));
await browser.close();
