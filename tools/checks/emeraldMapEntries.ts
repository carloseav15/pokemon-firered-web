// Headless sweep of Hoenn map entry (runEmeraldMapEntry: ON_TRANSITION, ON_LOAD, ON_RESUME) over every
// exported Emerald map. Reports the maps whose immediate scripts stop on an unported command/special.
// Usage: node emeraldMapEntries.mjs [--all | MAP_PREFIX ...]. Without arguments it checks the maps the Hoenn circuit
// and the P3 recorridos use and fails on any stop that is not listed in KNOWN; --all prints every stop (informative).
// No rendering, no walking.
import "./setupNodeGbaMock.ts";
import { readFileSync, existsSync } from "node:fs";
import { Game } from "../../src/games/firered/game.ts";
import { newSaveData, setSave } from "../../src/games/firered/save.ts";
import { rom, setDataRoot } from "../../src/core/rom.ts";
import { enterKanto } from "../../src/viewer/regionSave.ts";
import { initializeRegionalSession, resetViewerSessionInitialized } from "../../src/viewer/session.ts";
import { runEmeraldMapEntry } from "../../src/viewer/hoennMapEntry.ts";
import { setGameSpecials } from "../../src/games/firered/script/specials.ts";
import { EMERALD_SPECIALS, FIRERED_SPECIALS_SHARED_WITH_EMERALD } from "../../src/games/emerald/specials.ts";

const fetchFile = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.startsWith("/") && !existsSync("public" + url)) return new Response("", { status: 404 }); return fetchFile(input, init); }) as typeof fetch;
const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); }, removeItem: k => { storage.delete(k); } };
setDataRoot("/emerald");
rom.charmap = JSON.parse(readFileSync("public/emerald/charmap.json", "utf8"));
await rom.load();
const args = process.argv.slice(2);
const all = args.includes("--all");
const CIRCUIT = ["MAP_LITTLEROOT_TOWN", "MAP_OLDALE_TOWN", "MAP_ROUTE101", "MAP_ROUTE102", "MAP_ROUTE103", "MAP_SLATEPORT_CITY", "MAP_ROUTE110", "MAP_MOSSDEEP_CITY", "MAP_SS_TIDAL"];
const prefixes = all ? [] : args.length ? args : CIRCUIT;
/** Stops accepted for the circuit: link-scope scripts and the unported rotating gate puzzle of Trick House 6. */
const KNOWN = [/ValidateSavedWonderCard in CableClub_OnTransition/, /RotatingGate_InitPuzzle in Route110_TrickHousePuzzle6_OnTransition/];
const maps = (JSON.parse(readFileSync("public/emerald/maps.json", "utf8")).maps as Record<string, unknown> | string[]);
const ids = Array.isArray(maps) ? maps : Object.keys(maps);
const canvas = { width: 240, height: 160, getContext: () => ({}) } as unknown as HTMLCanvasElement;
setSave(newSaveData());
enterKanto();
resetViewerSessionInitialized();
initializeRegionalSession("hoenn", () => {});
const game = new Game(canvas);
setGameSpecials(EMERALD_SPECIALS, FIRERED_SPECIALS_SHARED_WITH_EMERALD);
const failures = new Map<string, string[]>();
let entered = 0;
for (const mapId of ids) {
  if (prefixes.length && !prefixes.some(p => mapId.startsWith(p))) continue;
  try {
    await runEmeraldMapEntry(game, { mapId, x: 1, y: 1, direction: "south", dynamic: null });
    entered++;
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    failures.set(message, [...(failures.get(message) ?? []), mapId]);
  }
}
console.log(`entered ${entered} maps, ${[...failures.values()].reduce((n, v) => n + v.length, 0)} stopped`);
for (const [message, list] of [...failures].sort((a, b) => b[1].length - a[1].length)) console.log(`${list.length}\t${message}\n\t${list.slice(0, 6).join(", ")}${list.length > 6 ? ", …" : ""}`);
const unexpected = [...failures.keys()].filter(message => !KNOWN.some(known => known.test(message)));
if (!all && unexpected.length) { console.error(`unexpected map-entry stops: ${unexpected.length}`); process.exit(1); }
if (!all) console.log(`check:emerald-map-entries PASS: circuit maps entered; only the listed link/rotating-gate stops remain (PREPARED: a fresh Hoenn bank per sweep, no walking)`);
