import type { EngineListener, RuntimeObject, WorldState } from "./types";
import { sourceInstructionsForScript } from "../content/sourceScripts";
import { GameClock } from "./GameClock";

export type ScriptInstruction =
  | { type: "say"; lines: string[] }
  | { type: "set_flag"; flag: string; value?: boolean }
  | { type: "set_variable"; key: string; value: number | string }
  | { type: "wait"; durationMs: number }
  | { type: "wait_frames"; frames: number }
  | { type: "label"; name: string }
  | { type: "goto"; label: string }
  | { type: "goto_if_flag"; flag: string; value: boolean; label: string }
  | { type: "goto_if_variable"; key: string; operator: "eq" | "ne" | "lt" | "ge"; value: number | string; label: string }
  | { type: "call"; label: string }
  | { type: "return" }
  | { type: "end" }
  | { type: "face_player" };

export class ScriptVM {
  private program: ScriptInstruction[] = [];
  private labels = new Map<string, number>();
  private pc = 0;
  private callStack: number[] = [];
  private waitFrames = 0;
  private waitingForDialogue = false;

  constructor(private readonly emit: EngineListener) {}

  load(instructions: ScriptInstruction[]): void {
    this.program = [...instructions];
    this.labels.clear();
    this.program.forEach((instruction, index) => {
      if (instruction.type === "label") this.labels.set(instruction.name, index);
    });
    this.pc = 0;
    this.callStack = [];
    this.waitFrames = 0;
    this.waitingForDialogue = false;
  }

  get isBusy(): boolean {
    return this.pc < this.program.length || this.waitFrames > 0 || this.waitingForDialogue;
  }

  resumeDialogue(): void {
    this.waitingForDialogue = false;
  }

  run(state: WorldState): boolean {
    if (this.waitingForDialogue) return true;
    if (this.waitFrames > 0) {
      this.waitFrames--;
      return true;
    }
    // FireRed executes consecutive commands until one yields to a later frame.
    // Bound the work so malformed imported scripts cannot stall the page.
    for (let count = 0; count < 256; count++) {
      const instruction = this.program[this.pc++];
      if (!instruction) return false;
      if (instruction.type === "label") continue;
      if (instruction.type === "end") {
        this.clear();
        return false;
      }
      if (instruction.type === "goto") {
        this.jump(instruction.label);
        continue;
      }
      if (instruction.type === "goto_if_flag") {
        if (this.isFlagSet(state, instruction.flag) === instruction.value) this.jump(instruction.label);
        continue;
      }
      if (instruction.type === "goto_if_variable") {
        const actual = state.variables[instruction.key] ?? 0;
        const expected = instruction.value;
        const matches = instruction.operator === "eq" ? actual === expected
          : instruction.operator === "ne" ? actual !== expected
            : typeof actual === "number" && typeof expected === "number"
              && (instruction.operator === "lt" ? actual < expected : actual >= expected);
        if (matches) this.jump(instruction.label);
        continue;
      }
      if (instruction.type === "call") {
        if (this.callStack.length >= 16) throw new Error("Script call stack overflow");
        this.callStack.push(this.pc);
        this.jump(instruction.label);
        continue;
      }
      if (instruction.type === "return") {
        const address = this.callStack.pop();
        if (address === undefined) {
          this.clear();
          return false;
        }
        this.pc = address;
        continue;
      }
      if (instruction.type === "say") {
        this.waitingForDialogue = true;
        this.emit({ type: "dialogue", lines: instruction.lines });
        return true;
      }
      if (instruction.type === "set_flag") this.setFlag(state, instruction.flag, instruction.value ?? true);
      if (instruction.type === "set_variable") state.variables[instruction.key] = instruction.value;
      if (instruction.type === "wait") {
        this.waitFrames = Math.max(0, Math.ceil(instruction.durationMs / GameClock.FRAME_MS));
        return true;
      }
      if (instruction.type === "wait_frames") {
        this.waitFrames = Math.max(0, Math.floor(instruction.frames));
        return true;
      }
    }
    return true;
  }

  setFlag(state: WorldState, flag: string, value = true): void {
    state.flags[flag] = value;
    for (const object of state.objects) {
      if (object.flag === flag) object.active = !value;
    }
  }

  isFlagSet(state: WorldState, flag: string): boolean {
    return state.flags[flag] === true;
  }

  clearFlag(state: WorldState, flag: string): void {
    this.setFlag(state, flag, false);
  }

  fromObject(object?: RuntimeObject): ScriptInstruction[] {
    if (!object?.script) return [];
    return sourceInstructionsForScript(object.script);
  }

  fromScriptName(script?: string): ScriptInstruction[] {
    return sourceInstructionsForScript(script);
  }

  clear(): void {
    this.program = [];
    this.labels.clear();
    this.pc = 0;
    this.callStack = [];
    this.waitFrames = 0;
    this.waitingForDialogue = false;
  }

  private jump(label: string): void {
    const address = this.labels.get(label);
    if (address === undefined) throw new Error(`Unknown script label: ${label}`);
    this.pc = address;
  }
}
