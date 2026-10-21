// Extracción y análisis de la partida guardada para el Hub de Pokémon Odyssey.
import type { SaveData } from "@game/save";

export interface ParsedSaveSummary {
  exists: boolean;
  continueUrl: string;
  playerName: string;
  trainerId: string;
  gender: "male" | "female";
  money: number;
  coins: number;
  badgeCount: number;
  badges: boolean[];
  partyCount: number;
  locationName: string;
  hasPokedex: boolean;
  timePlayedStr: string;
}

const BADGE_FLAGS = [2080, 2081, 2082, 2083, 2084, 2085, 2086, 2087];

function getMapFriendlyName(mapId?: string): string {
  if (!mapId) return "Kanto";
  const cleaned = mapId.replace(/^MAP_/, "");
  if (cleaned.includes("PALLET_TOWN")) return "Pallet Town";
  if (cleaned.includes("VIRIDIAN_CITY")) return "Viridian City";
  if (cleaned.includes("PEWTER_CITY")) return "Pewter City";
  if (cleaned.includes("CERULEAN_CITY")) return "Cerulean City";
  if (cleaned.includes("VERMILION_CITY")) return "Vermilion City";
  if (cleaned.includes("LAVENDER_TOWN")) return "Lavender Town";
  if (cleaned.includes("CELADON_CITY")) return "Celadon City";
  if (cleaned.includes("FUCHSIA_CITY")) return "Fuchsia City";
  if (cleaned.includes("SAFFRON_CITY")) return "Saffron City";
  if (cleaned.includes("CINNABAR_ISLAND")) return "Cinnabar Island";
  if (cleaned.includes("INDIGO_PLATEAU")) return "Indigo Plateau";
  if (cleaned.includes("ROUTE")) {
    const match = cleaned.match(/ROUTE(\d+)/);
    return match ? `Route ${match[1]}` : "Route";
  }
  if (cleaned.includes("VIRIDIAN_FOREST")) return "Viridian Forest";
  if (cleaned.includes("MT_MOON")) return "Mt. Moon";
  if (cleaned.includes("ROCK_TUNNEL")) return "Rock Tunnel";
  if (cleaned.includes("SEAFOAM_ISLANDS")) return "Seafoam Islands";
  if (cleaned.includes("VICTORY_ROAD")) return "Victory Road";
  if (cleaned.includes("POKEMON_TOWER")) return "Pokémon Tower";
  return cleaned.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

export async function loadSaveSummary(): Promise<ParsedSaveSummary> {
  const defaultEmpty: ParsedSaveSummary = {
    exists: false,
    continueUrl: "/play.html",
    playerName: "Trainer",
    trainerId: "00000",
    gender: "male",
    money: 0,
    coins: 0,
    badgeCount: 0,
    badges: [false, false, false, false, false, false, false, false],
    partyCount: 0,
    locationName: "Location unavailable",
    hasPokedex: false,
    timePlayedStr: "00:00",
  };

  try {
    // Match the engine/session preference without writing or migrating either save.
    let parsed: (Partial<SaveData> & { viewerNavigation?: { mapId?: string } }) | undefined;
    let continueUrl = "/play.html?fr=continue";
    for (const key of ["firered-save-v1", "firered-viewer-game-v1"]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const candidate = JSON.parse(raw);
        if (candidate?.version !== 2 || !Array.isArray(candidate.playerName) || !candidate.playerName.length) continue;
        parsed = candidate;
        if (key === "firered-viewer-game-v1" || candidate.viewerNavigation) {
          continueUrl = "/world.html#modo=explore";
        }
        break;
      } catch { /* A corrupt entry must not hide a valid fallback save. */ }
    }
    if (!parsed) return defaultEmpty;

    // Decodificar nombre del jugador
    let decodedName = "RED";
    if (Array.isArray(parsed.playerName) && parsed.playerName.length > 0) {
      // Names use the original exported charset. The home page does not boot the ROM.
      const response = await fetch('/fr/charmap.json');
      if (!response.ok) throw Error('Unable to load the saved-name character map');
      const charmap = await response.json() as { chars: Record<string, number> };
      const reverse = new Map<number, string>();
      for (const [character, code] of Object.entries(charmap.chars)) {
        if (!reverse.has(code)) reverse.set(code, character);
      }
      const end = parsed.playerName.indexOf(0xff);
      decodedName = parsed.playerName.slice(0, end < 0 ? undefined : end)
        .map(code => reverse.get(code) ?? '?').join('').trim();
      if (!decodedName) decodedName = parsed.playerGender === 1 ? "LEAF" : "RED";
    }

    const gender = parsed.playerGender === 1 ? "female" : "male";
    const rawTrainerId = parsed.trainerId ?? 0;
    const trainerIdStr = (rawTrainerId & 0xffff).toString().padStart(5, "0");

    // Verificar medallas
    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    const badges = BADGE_FLAGS.map((flagId) => {
      return ((flags[flagId >> 3] ?? 0) & (1 << (flagId & 7))) !== 0;
    });
    const badgeCount = badges.filter(Boolean).length;

    // Pokédex
    const hasPokedex = ((flags[2053 >> 3] ?? 0) & (1 << (2053 & 7))) !== 0; // FLAG_SYS_POKEDEX_GET

    // Ubicación
    const locationName = getMapFriendlyName(parsed.viewerNavigation?.mapId);

    // Tiempo de juego
    const totalMinutes = Math.floor((parsed.playTimeFrames ?? 0) / 3600);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const timePlayedStr = `${hours}h ${mins.toString().padStart(2, "0")}m`;

    return {
      exists: true,
      continueUrl,
      playerName: decodedName,
      trainerId: trainerIdStr,
      gender,
      money: parsed.money ?? 0,
      coins: parsed.coins ?? 0,
      badgeCount,
      badges,
      partyCount: Array.isArray(parsed.party) ? parsed.party.length : 0,
      locationName,
      hasPokedex,
      timePlayedStr,
    };
  } catch (err) {
    console.warn("Unable to read saved game:", err);
    return defaultEmpty;
  }
}
