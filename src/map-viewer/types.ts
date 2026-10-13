export type GameId = "firered" | "emerald" | "hns" | "crystal";
export type Layer = "base" | "sprites" | "collision";
export type Texture = { key: string; url: string; x: number; y: number; w: number; h: number; layer: Layer; decodedWidth: number; decodedHeight: number };
export type MapEntry = { id: string; name: string; width: number; height: number; searchable: string; available: boolean; unavailable?: string };
export type Rect = { id: string; x: number; y: number; w: number; h: number };
export type MapEvent = { kind: "warp" | "object" | "bg" | "coord"; x: number; y: number; index: number; destination?: string; destinationWarp?: string; details: Record<string, unknown> };
export type MapDetail = { info: Record<string, unknown>; connections: { destination: string; direction: string; offset: number }[]; events: MapEvent[] };
export type Source = {
  game: GameId; title: string; commit: string; limitations: string;
  maps: Map<string, MapEntry>;
  world: { width: number; height: number; origin: string; rects: Rect[]; notes: string };
  capabilities: { explore: boolean; sprites: boolean; collision: boolean; times: string[] };
  textures: (map: string, time: string, layers: ReadonlySet<Layer>, overview: boolean) => Texture[];
  details: (map: string, signal: AbortSignal) => Promise<MapDetail>;
  inspector: (map: string) => string | null;
};
export const SOURCES: { id: GameId; label: string }[] = [
  { id: "firered", label: "Kanto · FireRed" }, { id: "emerald", label: "Hoenn · Emerald" },
  { id: "hns", label: "Johto / Kanto · Heart & Soul" }, { id: "crystal", label: "Johto / Kanto · Crystal" },
];
export function gameId(value: string | null): GameId {
  return SOURCES.find(s => s.id === value)?.id ?? "firered";
}
