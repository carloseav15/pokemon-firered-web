import type { Layer } from "./constants";
import { LAYERS } from "./constants";

export type AppMode = "viewer" | "explore";
export type FillMode = "full" | "dim" | "off";
export type FillBiomeOverride = "auto" | "ocean" | "trees" | "mountain";

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

export type StoredSettings = {
  fillMode?: FillMode;
  fillBiomeOverride?: FillBiomeOverride;
  activeLayers?: Layer[];
  radar?: boolean;
};

export class ViewerState {
  appMode: AppMode = "viewer";
  view: ViewState = { zoom: 1, scrollLeft: 0, scrollTop: 0 };
  activeLayers = new Set<Layer>((LAYERS as unknown as Layer[]).filter((l) => l !== "colision"));
  fillMode: FillMode = "full";
  fillBiomeOverride: FillBiomeOverride = "auto";
  radar = true;

  anim: AnimState = {
    on: false,
    fps: 0,
    disabledNotice: "",
  };

  loadStored(): void {
    try {
      const raw = localStorage.getItem(VIEWER_STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as StoredSettings;
      if (s.fillMode) this.fillMode = s.fillMode;
      if (s.fillBiomeOverride) this.fillBiomeOverride = s.fillBiomeOverride;
      if (s.radar !== undefined) this.radar = s.radar;
      if (Array.isArray(s.activeLayers)) {
        this.activeLayers.clear();
        for (const l of s.activeLayers) {
          if ((LAYERS as readonly string[]).includes(l)) this.activeLayers.add(l);
        }
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
        activeLayers: [...this.activeLayers],
      };
      localStorage.setItem(VIEWER_STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Storage unavailable
    }
  }
}

export const state = new ViewerState();
