#!/usr/bin/env node
// Detector check for the ByteStruct LAYOUT probe: deliberately wrong TS struct classes MUST be flagged.
// Needs `node tools/oracle/run.mjs --group D` first (it leaves the C unit in .decomp-build/oracle). Not in any npm script.
import path from "node:path";
import { findToolchain } from "../lib/toolchain.mjs";
import { OUT, ROOT } from "../lib/cwasm.mjs";
import { bundleTs } from "../lib/tsbundle.mjs";
import { cLayout, probeTsLayout } from "../lib/structs.mjs";

const tc = findToolchain();
if (!tc.ok) { console.error("missing toolchain:", tc.missing.join("; ")); process.exit(2); }
const layout = cLayout(tc, path.join(OUT, "battle_util.oracle.c"), "ProtectStruct");
const { ns } = await bundleTs([{ tsTargets: [{ file: "src/fr/generated/structs.ts", name: "ProtectStruct" }] }], "layout-mutants");
const Real = ns.mods[path.join(ROOT, "src/fr/generated/structs.ts")].__o_ProtectStruct;

class WrongBit extends Real { // prlzImmobility read/written one bit too low
  get prlzImmobility() { return this.getBitsAt(0, 6, 1); }
  set prlzImmobility(v) { this.setBitsAt(0, 6, 1, v); }
}
class WrongOffset extends Real { // physicalDmg moved from byte 4 to byte 8
  get physicalDmg() { return this.view.getUint32(8, true); }
  set physicalDmg(v) { this.view.setUint32(8, v >>> 0, true); }
}
class WrongSize extends Real { static SIZE = 12; }
class NoSetter extends Real {}
Object.defineProperty(NoSetter.prototype, "endured", { get() { return 0; } });

const cases = [["real class", Real, 0], ["wrong bit", WrongBit, 1], ["wrong offset", WrongOffset, 1], ["wrong SIZE", WrongSize, 1], ["getter without setter", NoSetter, 1]];
let bad = 0;
for (const [name, Cls, expectFindings] of cases) {
  const f = probeTsLayout(Cls, layout);
  const ok = expectFindings ? f.length > 0 : f.length === 0;
  if (!ok) bad++;
  console.log(`${name.padEnd(24)} findings=${f.length} ${ok ? "as expected" : "UNEXPECTED"}${f[0] ? "  first: " + JSON.stringify(f[0]) : ""}`);
}
console.log(bad ? `${bad} UNEXPECTED` : "layout detector behaves as expected");
process.exit(bad ? 1 : 0);
