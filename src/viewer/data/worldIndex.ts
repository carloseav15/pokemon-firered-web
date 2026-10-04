import type { KantoIndex } from "../types";

export type WorldIndexData = {
  index: KantoIndex;
  minX: number;
  minY: number;
};

export async function fetchWorldIndex(): Promise<WorldIndexData> {
  const res = await fetch("/viewer/kanto.json");
  if (!res.ok) throw new Error("falta public/viewer/kanto.json: ejecuta npm run viewer:index");
  const index = (await res.json()) as KantoIndex;
  const minX = Math.min(...Object.values(index.maps).map((m) => m.x));
  const minY = Math.min(...Object.values(index.maps).map((m) => m.y));
  return { index, minX, minY };
}
