// Port of script.c: the bytecode script context (global and immediate).

import { rom } from "../rom";
import { COMMANDS } from "./commands";
import type { Overworld } from "../field/overworld";

export const SCRIPT_MODE_STOPPED = 0;
export const SCRIPT_MODE_BYTECODE = 1;
export const SCRIPT_MODE_NATIVE = 2;

const CONTEXT_RUNNING = 0;
const CONTEXT_WAITING = 1;
const CONTEXT_SHUTDOWN = 2;

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

  setupBytecode(ptr: number): void {
    this.scriptPtr = ptr;
    this.mode = SCRIPT_MODE_BYTECODE;
    this.entry = rom.labelAt(ptr) ?? ptr.toString(16);
  }

  setupNative(fn: () => boolean): void {
    this.mode = SCRIPT_MODE_NATIVE;
    this.nativePtr = fn;
  }

  stop(): void {
    this.mode = SCRIPT_MODE_STOPPED;
    this.scriptPtr = 0;
  }

  reset(): void {
    this.mode = SCRIPT_MODE_STOPPED;
    this.scriptPtr = 0;
    this.stack = [];
    this.nativePtr = null;
    this.comparisonResult = 0;
    this.data = [0, 0, 0, 0];
  }

  /** RunScriptCommand */
  run(): boolean {
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
  readHalfword(): number { const v = rom.u16(this.scriptPtr); this.scriptPtr += 2; return v; }
  readWord(): number { const v = rom.u32(this.scriptPtr); this.scriptPtr += 4; return v; }

  jump(ptr: number): void { this.scriptPtr = ptr; }

  call(ptr: number): void {
    if (this.stack.length + 1 >= 20) return;
    this.stack.push(this.scriptPtr);
    this.scriptPtr = ptr;
  }

  ret(): void {
    this.scriptPtr = this.stack.pop() ?? 0;
  }
}

/** The global script context plus RunScriptImmediately. */
export class ScriptContext {
  readonly global: ScriptRunner;
  private status = CONTEXT_SHUTDOWN;

  constructor(private readonly ow: Overworld) {
    this.global = new ScriptRunner(ow);
  }

  isEnabled(): boolean {
    return this.status === CONTEXT_RUNNING;
  }

  isActive(): boolean {
    return this.status !== CONTEXT_SHUTDOWN;
  }

  init(): void {
    this.global.reset();
    this.status = CONTEXT_SHUTDOWN;
  }

  /** ScriptContext_RunScript */
  runScript(): boolean {
    if (this.status === CONTEXT_SHUTDOWN || this.status === CONTEXT_WAITING) return false;
    this.ow.controlsLocked = true;
    let running: boolean;
    try {
      running = this.global.run();
    } catch (error) {
      console.error(`script error in ${this.global.entry}`, error);
      running = false;
    }
    if (!running) {
      this.status = CONTEXT_SHUTDOWN;
      this.ow.controlsLocked = false;
      return false;
    }
    return true;
  }

  /** ScriptContext_SetupScript */
  setupScript(ptr: number): void {
    const control = this.ow.control;
    control.msgBoxCancelable = false;
    control.msgBoxWalkawayDisabled = false;
    this.global.reset();
    this.global.setupBytecode(ptr);
    this.ow.controlsLocked = true;
    this.status = CONTEXT_RUNNING;
  }

  /** ScriptContext_Stop */
  stop(): void {
    this.status = CONTEXT_WAITING;
  }

  /** ScriptContext_Enable */
  enable(): void {
    this.status = CONTEXT_RUNNING;
    this.ow.controlsLocked = true;
  }

  /** RunScriptImmediately */
  runImmediately(ptr: number): void {
    const runner = new ScriptRunner(this.ow);
    runner.setupBytecode(ptr);
    for (let guard = 0; guard < 10000 && runner.run(); guard++) { /* run to completion */ }
  }
}
