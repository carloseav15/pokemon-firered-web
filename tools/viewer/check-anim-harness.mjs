// Comprobación del arnés de animaciones (src/games/firered/animHarness.ts): abre /?fr=anims, espera a que el combate esté
// listo y reproduce una muestra de movimientos de distintos tipos; falla si alguna no termina o hay errores de página.
// Uso (servidor de desarrollo en marcha):  BASE=http://localhost:5173 node tools/viewer/check-anim-harness.mjs
//   MOVES=MOVE_EMBER,MOVE_SURF (o ALL para todos los movimientos)  ATTACKER=SPECIES_CHARMANDER  TARGET=SPECIES_PIDGEY  SHOTS=/ruta/capturas
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
let MOVES = (process.env.MOVES ?? "MOVE_EMBER,MOVE_THUNDERBOLT,MOVE_SURF,MOVE_TACKLE,MOVE_PSYCHIC,MOVE_SHADOW_BALL,MOVE_ICE_BEAM,MOVE_RAZOR_LEAF").split(",");
const SHOTS = process.env.SHOTS ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`${BASE}/?fr=anims`);
await page.waitForFunction(() => !!window.frAnim, null, { timeout: 60000 });
const t0 = Date.now();
await page.evaluate(() => window.frAnim.ready);
console.log(`combate listo en ${Date.now() - t0} ms`);

if (MOVES.length === 1 && MOVES[0] === "ALL") {
  MOVES = await page.evaluate(() => Object.keys(window.frDebug.rom.constants).filter((k) => /^MOVE_[A-Z0-9_]+$/.test(k) && k !== "MOVE_NONE" && k !== "MOVE_UNAVAILABLE" && !/_COUNT$/.test(k)));
  console.log(`${MOVES.length} movimientos`);
}
let failed = 0;
for (const name of MOVES) {
  const t = Date.now();
  const result = await page.evaluate(
    (n) => window.frAnim.play(window.frDebug.rom.c(n)).then(() => "ok", (e) => String(e)),
    name,
  );
  const ms = Date.now() - t;
  if (result !== "ok") failed++;
  if (SHOTS) await page.locator("canvas").first().screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`${result === "ok" ? "OK  " : "FALLA"} ${name} ${ms} ms${result === "ok" ? "" : ` ${result}`}`);
}
if (errors.length) console.log("errores de página:", errors);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
