import type { Direction } from "../state";
import type { Element } from "../types";

export function dirFromElement(e: Element): Direction {
  if (e.direction === "up") return "north";
  if (e.direction === "down") return "south";
  if (e.direction === "left") return "west";
  if (e.direction === "right") return "east";
  return "south";
}

export function facingFrame(dir: Direction): { frame: number; flip: boolean } {
  if (dir === "north") return { frame: 1, flip: false };
  if (dir === "west") return { frame: 2, flip: false };
  if (dir === "east") return { frame: 2, flip: true };
  return { frame: 0, flip: false };
}
