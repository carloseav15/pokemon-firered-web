#!/usr/bin/env node
// Regression note: the CURRENT generator must emit the three semantics the oracle discovered in GetReceivedValueInPixels
// (the hand port was fixed for exactly these): u8 truncation of `totalPixels *= 8`, 32-bit product, s32 difference.
// Run `node tools/oracle/run.mjs --group real` first (it writes the generated module).
import { readFileSync } from "node:fs";
import path from "node:path";
import { OUT } from "../lib/cwasm.mjs";

const src = readFileSync(path.join(OUT, "real_generated_new.ts"), "utf8");
const fn = src.slice(src.indexOf("export function GetReceivedValueInPixels"));
const body = fn.slice(0, fn.indexOf("\n}\n"));
const checks = [
  ["u8 truncation of totalPixels *= 8", /totalPixels = \(totalPixels \* 8\) & 0xff;/],
  ["32-bit product (Math.imul)", /Math\.imul\(oldValue, totalPixels\)[\s\S]*Math\.imul\(newVal, totalPixels\)/],
  ["s32 wrap of oldValue - receivedValue", /newVal = \(oldValue - receivedValue\) \| 0;/],
];
let bad = 0;
for (const [name, re] of checks) { const ok = re.test(body); if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); }
process.exit(bad ? 1 : 0);
