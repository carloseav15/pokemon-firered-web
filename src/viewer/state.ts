import type { Layer } from "./constants";
import { LAYERS } from "./constants";

export type AppMode = "viewer" | "explore" | "edit";
export type FillMode = "full" | "dim" | "off";
export type FillBiomeOverride = "auto" | "ocean" | "trees" | "mountain";
export type Direction = "south" | "north" | "west" | "east";

export type ViewState = {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

export type PlayerState = {
  active: boolean;
  char: "red" | "leaf";
  mode: "walk" | "bike" | "surf";
  x: number;
  y: number;
  visualX: number;
  visualY: number;
  dir: Direction;
  step: number;
  moving: boolean;
  running: boolean;
};

export type EditState = {
  selectedMetatile: number;
  eyedropperActive: boolean;
  customPaintedTiles: Map<string, number>;
};

export type AnimState = {
  on: boolean;
  fps: number;
  disabledNotice: string;
};

export class ViewerState {
  appMode: AppMode = "viewer";
  view: ViewState = { zoom: 1, scrollLeft: 0, scrollTop: 0 };
  activeLayers = new Set<Layer>((LAYERS as unknown as Layer[]).filter((l) => l !== "colision"));
  fillMode: FillMode = "full";
  fillBiomeOverride: FillBiomeOverride = "auto";

  player: PlayerState = {
    active: false,
    char: "red",
    mode: "walk",
    x: 0,
    y: 0,
    visualX: 0,
    visualY: 0,
    dir: "south",
    step: 0,
    moving: false,
    running: false,
  };

  edit: EditState = {
    selectedMetatile: 28,
    eyedropperActive: false,
    customPaintedTiles: new Map(),
  };

  anim: AnimState = {
    on: false,
    fps: 0,
    disabledNotice: "",
  };
}

export const state = new ViewerState();
