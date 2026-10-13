export type GameId = "world" | "firered" | "emerald" | "hns" | "crystal";
export type Region = { id: string; title: string; game: GameId; version: string; parent?: string; level?: string; origin: string; x: number; y: number; w: number; h: number; maps: number; commit: string };
export type Journey = { id: string; a: string; b: string; label: string; kind: string; basis: string; description?: string };
export type Layer = "base" | "sprites" | "collision";
export type Texture = { key: string; url: string; x: number; y: number; w: number; h: number; layer: Layer; decodedWidth: number; decodedHeight: number };
export type MapEntry = { id: string; name: string; width: number; height: number; searchable: string; available: boolean; unavailable?: string; region?: string; originGame?: GameId; originId?: string; level?: string; positionPending?: boolean };
export type Rect = { id: string; x: number; y: number; w: number; h: number };
export type MapEvent = { kind: "warp" | "object" | "bg" | "coord"; x: number; y: number; index: number; destination?: string; destinationWarp?: string; referenceUrl?: string; details: Record<string, unknown> };
export type MapDetail = { info: Record<string, unknown>; connections: { destination: string; direction: string; offset: number; referenceUrl?: string }[]; events: MapEvent[] };
export type Source = {
  game: GameId; title: string; commit: string; limitations: string;
  maps: Map<string, MapEntry>;
  world: { width: number; height: number; origin: string; rects: Rect[]; notes: string };
  capabilities: { explore: boolean; sprites: boolean; collision: boolean; times: string[] };
  textures: (map: string, time: string, layers: ReadonlySet<Layer>, overview: boolean) => Texture[];
  details: (map: string, signal: AbortSignal) => Promise<MapDetail>;
  regions?: Region[]; journeys?: Journey[]; places?: { id: string; label: string }[];
  exploreLink?: (map: string, zoom: string) => string | null;
  inspector: (map: string) => string | null;
};
export const SOURCES: { id: GameId; label: string }[] = [
  { id: "world", label: "Mundo principal · Kanto / Johto / Hoenn" },
  { id: "firered", label: "Kanto · FireRed" }, { id: "emerald", label: "Hoenn · Emerald" },
  { id: "hns", label: "Johto / Kanto · Heart & Soul" }, { id: "crystal", label: "Johto / Kanto · Crystal" },
];
export function gameId(value: string | null): GameId {
  return SOURCES.find(s => s.id === value)?.id ?? "world";
}
