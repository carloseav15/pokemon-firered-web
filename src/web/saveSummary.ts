// Extracción y análisis de la partida guardada para el Hub de Pokémon Odyssey.
import { decode } from "@core/gba/charmap";
import type { SaveData } from "@game/save";

export interface ParsedSaveSummary {
  exists: boolean;
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

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-ES").format(amount);
}

function getMapFriendlyName(mapId?: string): string {
  if (!mapId) return "Región de Kanto";
  const cleaned = mapId.replace(/^MAP_/, "");
  if (cleaned.includes("PALLET_TOWN")) return "Pueblo Paleta";
  if (cleaned.includes("VIRIDIAN_CITY")) return "Ciudad Verde";
  if (cleaned.includes("PEWTER_CITY")) return "Ciudad Plateada";
  if (cleaned.includes("CERULEAN_CITY")) return "Ciudad Celeste";
  if (cleaned.includes("VERMILION_CITY")) return "Ciudad Carmín";
  if (cleaned.includes("LAVENDER_TOWN")) return "Pueblo Lavanda";
  if (cleaned.includes("CELADON_CITY")) return "Ciudad Azulona";
  if (cleaned.includes("FUCHSIA_CITY")) return "Ciudad Fucsia";
  if (cleaned.includes("SAFFRON_CITY")) return "Ciudad Azafrán";
  if (cleaned.includes("CINNABAR_ISLAND")) return "Isla Canela";
  if (cleaned.includes("INDIGO_PLATEAU")) return "Meseta Añil";
  if (cleaned.includes("ROUTE")) {
    const match = cleaned.match(/ROUTE(\d+)/);
    return match ? `Ruta ${match[1]}` : "Ruta de Kanto";
  }
  if (cleaned.includes("VIRIDIAN_FOREST")) return "Bosque Verde";
  if (cleaned.includes("MT_MOON")) return "Monte Moon";
  if (cleaned.includes("ROCK_TUNNEL")) return "Túnel Roca";
  if (cleaned.includes("SEAFOAM_ISLANDS")) return "Islas Espuma";
  if (cleaned.includes("VICTORY_ROAD")) return "Calle Victoria";
  if (cleaned.includes("POKEMON_TOWER")) return "Torre Pokémon";
  return cleaned.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

export function loadSaveSummary(): ParsedSaveSummary {
  const defaultEmpty: ParsedSaveSummary = {
    exists: false,
    playerName: "Entrenador",
    trainerId: "00000",
    gender: "male",
    money: 0,
    coins: 0,
    badgeCount: 0,
    badges: [false, false, false, false, false, false, false, false],
    partyCount: 0,
    locationName: "Sin ubicación",
    hasPokedex: false,
    timePlayedStr: "00:00",
  };

  try {
    const raw = localStorage.getItem("firered-save-v1") || localStorage.getItem("firered-viewer-game-v1");
    if (!raw) return defaultEmpty;

    const parsed = JSON.parse(raw) as Partial<SaveData> & {
      viewerNavigation?: { mapId?: string };
      timePlayedHours?: number;
      timePlayedMinutes?: number;
    };

    if (!parsed || typeof parsed !== "object") return defaultEmpty;

    // Decodificar nombre del jugador
    let decodedName = "RED";
    if (Array.isArray(parsed.playerName) && parsed.playerName.length > 0) {
      decodedName = decode(parsed.playerName).trim();
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
    const hours = parsed.timePlayedHours ?? 0;
    const mins = parsed.timePlayedMinutes ?? 0;
    const timePlayedStr = `${hours}h ${mins.toString().padStart(2, "0")}m`;

    return {
      exists: true,
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
    console.warn("No se pudo cargar la partida guardada:", err);
    return defaultEmpty;
  }
}
