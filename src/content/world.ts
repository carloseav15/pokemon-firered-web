export type TileKind = "grass" | "path" | "water" | "wall" | "house";

export const worldMap: string[] = [
  "WWWWWWWWWWWWWWW",
  "W.............W",
  "W.............W",
  "W..======.DH..W",
  "W..=......=...W",
  "W..=......=...W",
  "W..========...W",
  "W.............W",
  "W......~~~....W",
  "WWWWWWWWWWWWWWW",
];

export const npc = { id: "researcher", x: 9, y: 3, label: "NPC" };

export const townObjects = {
  houses: [
    { x: 2, y: 1 },
    { x: 10, y: 1 },
  ],
  trees: [
    { x: 1, y: 1 }, { x: 6, y: 1 }, { x: 14, y: 1 },
    { x: 1, y: 7 }, { x: 13, y: 7 }, { x: 4, y: 8 },
  ],
  signs: [{ x: 6, y: 6 }],
};

export function tileKind(symbol: string): TileKind {
  if (symbol === "=") return "path";
  if (symbol === "~") return "water";
  if (symbol === "W") return "wall";
  if (symbol === "H" || symbol === "D") return "house";
  return "grass";
}

export function isWalkable(x: number, y: number): boolean {
  const row = worldMap[y];
  if (!row || x < 0 || x >= row.length) return false;
  if (["W", "~", "H"].includes(row[x])) return false;
  const insideHouse = townObjects.houses.some(
    (house) => x >= house.x && x <= house.x + 1 && y >= house.y && y <= house.y + 1,
  );
  return !insideHouse;
}
