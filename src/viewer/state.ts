import type { Layer } from "./constants";
import { LAYERS } from "./constants";

export type AppMode = "viewer" | "explore";
export type FillMode = "full" | "dim" | "off";
export type FillBiomeOverride = "auto" | "ocean" | "trees" | "mountain";
export type PlayerCharacter = "red" | "leaf";
export type PlayerVehicle = "walk" | "bike" | "surf";

export type ViewState = {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

export type AnimState = {
  on: boolean;
  fps: number;
  disabledNotice: string;
};

export const VIEWER_STORAGE_KEY = "pokemon-gba-web-lab.viewer.v1";

const FILL_MODES = ["full", "dim", "off"] as const;
const FILL_BIOME_OVERRIDES = ["auto", "ocean", "trees", "mountain"] as const;
const PLAYER_CHARS = ["red", "leaf"] as const;

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export type StoredSettings = {
  fillMode?: FillMode;
  fillBiomeOverride?: FillBiomeOverride;
  activeLayers?: Layer[];
  radar?: boolean;
  playerChar?: PlayerCharacter;
  audio?: boolean;
};

export class ViewerState {
  appMode: AppMode = "viewer";
  view: ViewState = { zoom: 1, scrollLeft: 0, scrollTop: 0 };
  activeLayers = new Set<Layer>((LAYERS as unknown as Layer[]).filter((l) => l !== "colision"));
  fillMode: FillMode = "full";
  fillBiomeOverride: FillBiomeOverride = "auto";
  radar = true;
  playerChar: PlayerCharacter = "red";
  audio = false;

  anim: AnimState = {
    on: false,
    fps: 0,
    disabledNotice: "",
  };

  loadStored(): void {
    try {
      const raw = localStorage.getItem(VIEWER_STORAGE_KEY);
      if (!raw) return;
      const s: unknown = JSON.parse(raw);
      // Raíz inválida: conserva todos los defaults en vez de descartar a medias.
      if (typeof s !== "object" || s === null || Array.isArray(s)) return;
      const o = s as Record<string, unknown>;
      // Cada campo inválido conserva su default; los válidos sí se cargan.
      if (isOneOf(o["fillMode"], FILL_MODES)) this.fillMode = o["fillMode"];
      if (isOneOf(o["fillBiomeOverride"], FILL_BIOME_OVERRIDES)) {
        this.fillBiomeOverride = o["fillBiomeOverride"];
      }
      if (typeof o["radar"] === "boolean") this.radar = o["radar"];
      if (isOneOf(o["playerChar"], PLAYER_CHARS)) this.playerChar = o["playerChar"];
      if (typeof o["audio"] === "boolean") this.audio = o["audio"];
      if (Array.isArray(o["activeLayers"])) {
        const known = new Set<Layer>();
        for (const l of o["activeLayers"]) {
          if (typeof l === "string" && (LAYERS as readonly string[]).includes(l)) {
            known.add(l as Layer);
          }
        }
        // [] es cero capas: se acepta y sustituye el default.
        this.activeLayers = known;
      }
    } catch {
      // Ignore invalid localStorage
    }
  }

  saveStored(): void {
    try {
      const s: StoredSettings = {
        fillMode: this.fillMode,
        fillBiomeOverride: this.fillBiomeOverride,
        radar: this.radar,
        playerChar: this.playerChar,
        audio: this.audio,
        activeLayers: [...this.activeLayers],
      };
      localStorage.setItem(VIEWER_STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Storage unavailable
    }
  }
}

export const state = new ViewerState();
