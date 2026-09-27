// Compare the generated C pointer accessor and battle-interface caller to the
// exported INCBIN symbol and C harness results.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GetBattleInterfaceGfxPtr } from "../../src/fr/generated/incbinRowAccessors.ts";
import { incbin, registerIncbinIndex, registerPack } from "../../src/fr/hw/assets.ts";

const index = JSON.parse(readFileSync("public/fr/incbin/index.json", "utf8")) as {
  packs: Record<string, number>;
  symbols: Record<string, [string, number, number]>;
};
registerIncbinIndex(index);
const [pack, offset, size] = index.symbols.gBattleInterface_Gfx;
const packBytes = Uint8Array.from(readFileSync(`public/fr/incbin/${pack}.bin`));
registerPack(pack, packBytes);
const graphics = incbin("gBattleInterface_Gfx");
assert.equal(graphics.length, size);

const cResults = JSON.parse(readFileSync(".decomp-build/checks/battleInterfaceGfxPtrResults.json", "utf8")) as {
  inputs: number[];
  rowSize: number;
};
assert.equal(cResults.rowSize, 32, "C declares gBattleInterface_Gfx[][32]");
for (const input of cResults.inputs) {
  const row = input & 0xff;
  const ptr = GetBattleInterfaceGfxPtr(input);
  assert.equal(ptr.off, row * cResults.rowSize, `C pointer offset for element ${input}`);
  assert.equal(ptr.buf.length, size);
  assert.deepEqual(ptr.buf, packBytes.subarray(offset, offset + size), `C INCBIN bytes for element ${input}`);
}

const source = readFileSync("src/fr/battle/interface.ts", "utf8");
assert.match(source, /const ptr = GetBattleInterfaceGfxPtr\(elementId\);\s*return \{ buf: ptr\.buf, off: ptr\.off \+ byteOffset \};/);
const preload = readFileSync("src/fr/battle/preload.ts", "utf8");
assert.match(preload, /"graphics_battle_interface"/, "active battle preload must load the INCBIN pack");
console.log(`GetBattleInterfaceGfxPtr: ${cResults.inputs.length} C row pointer cases and active battle-interface pack/caller checks passed`);
