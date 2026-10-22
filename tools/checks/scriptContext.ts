// Headless check for script.c parity (context, RAM scripts, Quest Log input)
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { rom, ROM_BASE } from "../../src/core/rom.ts";
import type { Overworld } from "../../src/core/field/overworld.ts";
import { save } from "../../src/games/firered/save.ts";
import {
  ScriptRunner, ScriptContext, UnsupportedScriptCommandError, SCRIPT_MODE_STOPPED,
  ClearRamScript,
  InitRamScript,
  InitRamScript_NoObjectEvent,
  GetRamScript,
  ValidateRamScript,
  GetSavedRamScriptIfValid,
  CalculateRamScriptChecksum,
  SetQuestLogInputIsDpadFlag,
  ClearQuestLogInputIsDpadFlag,
  IsQuestLogInputDpad,
  RegisterQuestLogInput,
  ClearQuestLogInput,
  GetRegisteredQuestLogInput,
  setRamScriptRetAddr,
  gRamScriptRetAddr,
} from "../../src/core/script/context.ts";

// =========================================================================
// 1. Quest Log Input Tracking
// =========================================================================
{
  ClearQuestLogInputIsDpadFlag();
  assert.equal(IsQuestLogInputDpad(), false);
  SetQuestLogInputIsDpadFlag();
  assert.equal(IsQuestLogInputDpad(), true);
  ClearQuestLogInputIsDpadFlag();
  assert.equal(IsQuestLogInputDpad(), false);

  ClearQuestLogInput();
  assert.equal(GetRegisteredQuestLogInput(), 0);
  RegisterQuestLogInput(0x12);
  assert.equal(GetRegisteredQuestLogInput(), 0x12);
  RegisterQuestLogInput(0x1234); // Should narrow to u8 (0x34)
  assert.equal(GetRegisteredQuestLogInput(), 0x34);
  ClearQuestLogInput();
  assert.equal(GetRegisteredQuestLogInput(), 0);
}

// =========================================================================
// 2. RAM Script Initialization and Checksum
// =========================================================================
{
  ClearRamScript();
  assert.equal(save.ramScript!.checksum, 0);
  assert.equal(save.ramScript!.data.magic, 0);

  const testBytecode = [0x02, 0x05, 0x08, 0x02];
  InitRamScript(testBytecode, testBytecode.length, 3, 10, 1);
  assert.equal(save.ramScript!.data.magic, 51, "Magic byte is 51 (RAM_SCRIPT_MAGIC)");
  assert.equal(save.ramScript!.data.mapGroup, 3);
  assert.equal(save.ramScript!.data.mapNum, 10);
  assert.equal(save.ramScript!.data.objectId, 1);
  assert.equal(save.ramScript!.checksum, CalculateRamScriptChecksum(), "Checksum matches calculated CRC16");

  // Map location match in GetRamScript
  save.location.mapGroup = 3;
  save.location.mapNum = 10;
  const scriptPtr = 0x8123456;
  const ramPtr = GetRamScript(1, scriptPtr);
  assert.notEqual(ramPtr, scriptPtr, "RAM script override selected when map and objectId match");
  assert.equal(gRamScriptRetAddr, scriptPtr, "Return address recorded");

  // Non-matching objectId returns original script pointer
  const defaultPtr = GetRamScript(2, scriptPtr);
  assert.equal(defaultPtr, scriptPtr, "Default script used when objectId does not match");
}

// =========================================================================
// 3. No-ObjectEvent RAM Script & Validation
// =========================================================================
{
  const testScript = [0x6A, 0x00, 0x02]; // End-style script
  InitRamScript_NoObjectEvent(testScript, testScript.length);
  assert.equal(save.ramScript!.data.mapGroup, 0xFF);
  assert.equal(save.ramScript!.data.mapNum, 0xFF);
  assert.equal(save.ramScript!.data.objectId, 0xFF);
  assert.equal(ValidateRamScript(), true, "ValidateRamScript returns true for valid no-object RAM script");

  // Corrupted checksum invalidates RAM script
  save.ramScript!.checksum ^= 0x1234;
  assert.equal(ValidateRamScript(), false, "ValidateRamScript returns false on checksum mismatch");

  // GetSavedRamScriptIfValid clears corrupted slot and returns null
  const res = GetSavedRamScriptIfValid();
  assert.equal(res, null, "GetSavedRamScriptIfValid returns null when wonder card is not active or checksum bad");
  assert.equal(save.ramScript!.checksum, 0, "Corrupted slot is cleared");
}

// =========================================================================
// 4. Return Address Helper
// =========================================================================
{
  setRamScriptRetAddr(0x1234);
  assert.equal(gRamScriptRetAddr, 0x1234);
  setRamScriptRetAddr(null);
  assert.equal(gRamScriptRetAddr, null);
}

console.log("✓ script.c context, RAM scripts, checksums and input tracking tests passed");

// PREPARED bytecode: unsupported operands deliberately form a valid setvar.
// The old fallback ran those operands and mutated save data after the fault.
{
  const oldMeta = rom.scriptMeta, oldScripts = rom.scripts;
  const variable = 0x4001, before = save.vars[1];
  const meta = (commands: string[]) => ({ base: ROM_BASE, externBase: 0x0f000000,
    labels: {}, externals: [], commands, specials: [], std: [] });
  let unlocked = 0;
  const ow = { LockPlayerFieldControls() {}, UnlockPlayerFieldControls() { unlocked++; } } as unknown as Overworld;
  try {
    rom.scriptMeta = meta(['ScrCmd_missing_regression', 'ScrCmd_setvar', 'ScrCmd_end']);
    rom.scripts = new Uint8Array([0, 1, variable & 255, variable >> 8, 123, 0, 2]);
    const runner = new ScriptRunner(ow); runner.SetupBytecodeScript(ROM_BASE);
    assert.throws(() => runner.RunScriptCommand(), (error: unknown) => {
      assert.ok(error instanceof UnsupportedScriptCommandError);
      assert.equal(error.address, ROM_BASE); assert.equal(error.command, 'ScrCmd_missing_regression');
      return true;
    });
    assert.equal(runner.mode, SCRIPT_MODE_STOPPED); assert.equal(save.vars[1], before);
    // Global execution releases controls, and never interprets operands either.
    const global = new ScriptContext(ow); global.global.SetupBytecodeScript(ROM_BASE); global.ScriptContext_Enable();
    const errorLog = console.error; const errors: unknown[][] = [];
    try { console.error = (...args: unknown[]) => { errors.push(args); }; assert.equal(global.ScriptContext_RunScript(), false); }
    finally { console.error = errorLog; }
    assert.equal(errors.length, 1); assert.equal(unlocked, 1); assert.equal(global.isActive(), false);
    assert.equal(save.vars[1], before);
    // Switching exports in the same session must rebuild opcode dispatch.
    rom.scriptMeta = meta(['ScrCmd_setvar', 'ScrCmd_end']);
    rom.scripts = new Uint8Array([0, variable & 255, variable >> 8, 42, 0, 1]);
    const next = new ScriptRunner(ow); next.SetupBytecodeScript(ROM_BASE);
    assert.equal(next.RunScriptCommand(), false); assert.equal(save.vars[1], 42);
    rom.scriptMeta = meta(['ScrCmd_end']); rom.scripts = new Uint8Array([0]);
    const end = new ScriptRunner(ow); end.SetupBytecodeScript(ROM_BASE);
    assert.equal(end.RunScriptCommand(), false);
    rom.scripts = new Uint8Array([255]); end.SetupBytecodeScript(ROM_BASE);
    assert.throws(() => end.RunScriptCommand(), UnsupportedScriptCommandError);
  } finally { rom.scriptMeta = oldMeta; rom.scripts = oldScripts; save.vars[1] = before; }
}
console.log('✓ unsupported bytecode stops before operands; controls and regional opcode reload PASS (PREPARED)');
