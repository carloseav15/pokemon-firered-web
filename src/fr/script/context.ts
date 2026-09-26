// Port of script.c: the bytecode script context (global and immediate).

import { RAM_SCRIPT_BASE, rom } from "../rom";
import { COMMANDS } from "./commands";
import type { Overworld } from "../field/overworld";
import { save } from "../save";
import { CalcCRC16WithTable } from "../util";

export const SCRIPT_MODE_STOPPED = 0;
export const SCRIPT_MODE_BYTECODE = 1;
export const SCRIPT_MODE_NATIVE = 2;

const CONTEXT_RUNNING = 0;
const CONTEXT_WAITING = 1;
const CONTEXT_SHUTDOWN = 2;
const RAM_SCRIPT_MAGIC = 51;
const RAM_SCRIPT_DATA_SIZE = 999;
const RAM_SCRIPT_BYTES = 995;

export let gRamScriptRetAddr: number | null = null;

function ramScriptDataBytes(): Uint8Array {
  const data = save.ramScript!.data;
  const bytes = new Uint8Array(RAM_SCRIPT_DATA_SIZE);
  bytes[0] = data.magic;
  bytes[1] = data.mapGroup;
  bytes[2] = data.mapNum;
  bytes[3] = data.objectId;
  bytes.set(data.script.slice(0, RAM_SCRIPT_BYTES), 4);
  return bytes;
}

/** CalculateRamScriptChecksum (script.c), over the complete packed RamScriptData. */
export function CalculateRamScriptChecksum(): number {
  return CalcCRC16WithTable(ramScriptDataBytes(), RAM_SCRIPT_DATA_SIZE);
}

/** ClearRamScript (script.c). */
export function ClearRamScript(): void {
  save.ramScript = { checksum: 0, data: { magic: 0, mapGroup: 0, mapNum: 0, objectId: 0, script: new Array(RAM_SCRIPT_BYTES).fill(0) } };
  rom.setRamScriptBytes(new Uint8Array(RAM_SCRIPT_DATA_SIZE));
}

/** InitRamScript (script.c), copying a bounded script into SaveBlock1's RAM script slot. */
export function InitRamScript(script: ArrayLike<number>, scriptSize: number, mapGroup: number, mapNum: number, objectId: number): boolean {
  ClearRamScript();
  if (scriptSize > RAM_SCRIPT_BYTES) return false;
  const slot = save.ramScript!;
  slot.data.magic = RAM_SCRIPT_MAGIC;
  slot.data.mapGroup = mapGroup & 0xff;
  slot.data.mapNum = mapNum & 0xff;
  slot.data.objectId = objectId & 0xff;
  for (let i = 0; i < scriptSize; i++) slot.data.script[i] = script[i] ?? 0;
  slot.checksum = CalculateRamScriptChecksum();
  rom.setRamScriptBytes(ramScriptDataBytes());
  return true;
}

/** GetRamScript (script.c): select a valid override for this map and object, else use the ROM script. */
export function GetRamScript(objectId: number, script: number): number {
  gRamScriptRetAddr = null;
  const slot = save.ramScript!;
  if (slot.data.magic !== RAM_SCRIPT_MAGIC || slot.data.mapGroup !== save.location.mapGroup || slot.data.mapNum !== save.location.mapNum || slot.data.objectId !== (objectId & 0xff)) return script;
  if (CalculateRamScriptChecksum() !== slot.checksum) {
    ClearRamScript();
    return script;
  }
  gRamScriptRetAddr = script;
  rom.setRamScriptBytes(ramScriptDataBytes());
  return RAM_SCRIPT_BASE + 4;
}

/** ValidateRamScript (script.c): validate a RAM script stored without an object event. */
export function ValidateRamScript(): boolean {
  const slot = save.ramScript!;
  return slot.data.magic === RAM_SCRIPT_MAGIC
    && slot.data.mapGroup === 0xff && slot.data.mapNum === 0xff && slot.data.objectId === 0xff
    && CalculateRamScriptChecksum() === slot.checksum;
}

/** InitRamScript_NoObjectEvent (script.c). */
export function InitRamScript_NoObjectEvent(script: ArrayLike<number>, scriptSize: number): void {
  InitRamScript(script, Math.min(scriptSize, RAM_SCRIPT_BYTES), 0xff, 0xff, 0xff);
}

export type ScriptCommand = (ctx: ScriptRunner) => boolean;

let commandTable: ScriptCommand[] | undefined;
const missing = new Set<string>();

function table(): ScriptCommand[] {
  if (!commandTable) {
    commandTable = rom.scriptMeta.commands.map((name) => {
      const fn = COMMANDS[name.replace(/^ScrCmd_/, "")];
      if (fn) return fn;
      return (ctx: ScriptRunner) => {
        if (!missing.has(name)) {
          missing.add(name);
          console.warn(`script command not implemented: ${name}`);
        }
        void ctx;
        return false;
      };
    });
  }
  return commandTable;
}

/** One struct ScriptContext. */
export class ScriptRunner {
  mode = SCRIPT_MODE_STOPPED;
  scriptPtr = 0;
  stack: number[] = [];
  nativePtr: (() => boolean) | null = null;
  comparisonResult = 0;
  data = [0, 0, 0, 0];
  /** Label name of the script entry, for debugging. */
  entry = "";

  constructor(readonly ow: Overworld) {}

  SetupBytecodeScript(ptr: number): number {
    this.scriptPtr = ptr;
    this.mode = SCRIPT_MODE_BYTECODE;
    this.entry = rom.labelAt(ptr) ?? ptr.toString(16);
    return 1;
  }

  SetupNativeScript(fn: () => boolean): void {
    this.mode = SCRIPT_MODE_NATIVE;
    this.nativePtr = fn;
  }

  StopScript(): void {
    this.mode = SCRIPT_MODE_STOPPED;
    this.scriptPtr = 0;
  }

  InitScriptContext(): void {
    this.mode = SCRIPT_MODE_STOPPED;
    this.scriptPtr = 0;
    this.stack = [];
    this.nativePtr = null;
    this.comparisonResult = 0;
    this.data = [0, 0, 0, 0];
  }

  /** RunScriptCommand */
  RunScriptCommand(): boolean {
    switch (this.mode) {
      case SCRIPT_MODE_STOPPED:
        return false;
      case SCRIPT_MODE_NATIVE:
        if (this.nativePtr) {
          if (this.nativePtr()) this.mode = SCRIPT_MODE_BYTECODE;
          return true;
        }
        this.mode = SCRIPT_MODE_BYTECODE;
      // fallthrough
      case SCRIPT_MODE_BYTECODE: {
        const commands = table();
        for (let guard = 0; guard < 100000; guard++) {
          if (!this.scriptPtr) {
            this.mode = SCRIPT_MODE_STOPPED;
            return false;
          }
          const op = rom.u8(this.scriptPtr++);
          const fn = commands[op];
          if (!fn) {
            this.mode = SCRIPT_MODE_STOPPED;
            return false;
          }
          if (fn(this)) return true;
          if (this.mode === SCRIPT_MODE_STOPPED) return false;
        }
        console.warn("script ran too long without yielding", this.entry);
        return true;
      }
    }
    return true;
  }

  readByte(): number { return rom.u8(this.scriptPtr++); }
  ScriptReadHalfword(): number { const v = rom.u16(this.scriptPtr); this.scriptPtr += 2; return v; }
  ScriptReadWord(): number { const v = rom.u32(this.scriptPtr); this.scriptPtr += 4; return v; }

  ScriptJump(ptr: number): void { this.scriptPtr = ptr; }

  private ScriptPush(ptr: number): number {
    if (this.stack.length + 1 >= 20) return 1;
    this.stack.push(ptr);
    return 0;
  }

  private ScriptPop(): number | null {
    return this.stack.pop() ?? null;
  }

  ScriptCall(ptr: number): void {
    this.ScriptPush(this.scriptPtr);
    this.scriptPtr = ptr;
  }

  ScriptReturn(): void {
    this.scriptPtr = this.ScriptPop() ?? 0;
  }
}

/** The global script context plus RunScriptImmediately. */
export class ScriptContext {
  readonly global: ScriptRunner;
  private status = CONTEXT_SHUTDOWN;

  constructor(private readonly ow: Overworld) {
    this.global = new ScriptRunner(ow);
  }

  ScriptContext_IsEnabled(): boolean {
    return this.status === CONTEXT_RUNNING;
  }

  isActive(): boolean {
    return this.status !== CONTEXT_SHUTDOWN;
  }

  ScriptContext_Init(): void {
    this.global.InitScriptContext();
    this.status = CONTEXT_SHUTDOWN;
  }

  /** ScriptContext_RunScript */
  ScriptContext_RunScript(): boolean {
    if (this.status === CONTEXT_SHUTDOWN || this.status === CONTEXT_WAITING) return false;
    this.ow.LockPlayerFieldControls();
    let running: boolean;
    try {
      running = this.global.RunScriptCommand();
    } catch (error) {
      console.error(`script error in ${this.global.entry}`, error);
      running = false;
    }
    if (!running) {
      this.status = CONTEXT_SHUTDOWN;
      this.ow.UnlockPlayerFieldControls();
      return false;
    }
    return true;
  }

  /** ScriptContext_SetupScript */
  ScriptContext_SetupScript(ptr: number): void {
    const control = this.ow.control;
    control.ClearMsgBoxCancelableState();
    control.EnableMsgBoxWalkaway();
    this.global.InitScriptContext();
    this.global.SetupBytecodeScript(ptr);
    this.ow.LockPlayerFieldControls();
    this.status = CONTEXT_RUNNING;
  }

  /** ScriptContext_Stop */
  ScriptContext_Stop(): void {
    this.status = CONTEXT_WAITING;
  }

  /** ScriptContext_Enable */
  ScriptContext_Enable(): void {
    this.status = CONTEXT_RUNNING;
    this.ow.LockPlayerFieldControls();
  }

  /** RunScriptImmediately */
  RunScriptImmediately(ptr: number): void {
    const runner = new ScriptRunner(this.ow);
    runner.SetupBytecodeScript(ptr);
    for (let guard = 0; guard < 10000 && runner.RunScriptCommand(); guard++) { /* run to completion */ }
  }
}
