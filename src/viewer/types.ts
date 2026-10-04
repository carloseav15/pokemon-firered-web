// Tipos del indice generado por tools/viewer/world_index.py (docs/VISOR-MUNDO.md par. 4.4).

export type WorldMap = {
  x: number;
  y: number;
  width: number;
  height: number;
  layout: string;
  title: string;
  section: string;
  music?: number;
  musicName?: string;
  weather?: number;
};
export type Conflict = { from: string; to: string; placed: [number, number]; proposed: [number, number] };
export type Element = {
  map: string;
  x: number;
  y: number;
  layer: string;
  localId?: number;
  graphics?: string;
  flag?: string | number;
  movedByScript?: boolean;
  trainerRange?: number;
  trainer?: string;
  direction?: string;
  destMap?: string;
  destName?: string;
  startsHidden?: boolean;
};
export type Trigger = { map: string; x: number; y: number; var: string; value: number; script: string };
export type Writer =
  | { value: number | string; map: string; label: string; line: number }
  | { action: "set" | "clear"; map: string; label: string; line: number }
  | { action: "add"; value: number | string; map: string; label: string; line: number }
  | { action: "copy"; from: string; map: string; label: string; line: number };
export type KantoIndex = {
  _meta: { generator: string; decomp_commit: string };
  world: { width: number; height: number; origin: string };
  maps: Record<string, WorldMap>;
  conflicts: Conflict[];
  elements: Element[];
  triggers: Trigger[];
  writers: Record<string, Writer[]>;
  initialFlags: Record<string, number>;
};
