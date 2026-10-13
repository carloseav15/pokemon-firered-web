import type { GameId, Layer, MapDetail, MapEntry, MapEvent, Rect, Region, Journey, Source, Texture } from "./types";

async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}. Consulta los comandos de datos en el Atlas.`);
  return response.json() as Promise<T>;
}
const pretty = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ");
const texture = (url: string, x: number, y: number, w: number, h: number, layer: Layer, scale = 1): Texture => ({ key: `${layer}:${url}:${x}:${y}`, url, x, y, w, h, layer, decodedWidth: Math.round(w * scale), decodedHeight: Math.round(h * scale) });
const entry = (id: string, name: string, width: number, height: number, available: boolean, extra = "", unavailable?: string): MapEntry => ({ id, name: pretty(name), width, height, available, unavailable, searchable: `${id} ${name} ${extra}`.toLowerCase().replace(/[^a-z0-9]/g, "") });
function events(groups: [MapEvent["kind"], Record<string, unknown>[]][], destination: string, warp: string): MapEvent[] {
  return groups.flatMap(([kind, rows]) => rows.map((row, index) => ({ kind, index, x: Number(row.x), y: Number(row.y),
    destination: row[destination] == null ? undefined : String(row[destination]), destinationWarp: row[warp] == null ? undefined : String(row[warp]), details: row })));
}

async function gba(game: "firered" | "emerald", signal: AbortSignal): Promise<Source> {
  type M = { id: string; name: string; width: number; height: number; image: string; sprites: string | null; collision: string; detail: string; primary: string; secondary: string; section: string };
  type Chunk = { file: string; x: number; y: number; w: number; h: number; layer: "image" | "sprites" | "collision" };
  const root = `/map-viewer/${game}/`;
  const doc = await json<{ _meta: { sourceCommit: string }; maps: Record<string, M>; world: { w: number; h: number; origin: string; maps: Rect[]; chunks: Chunk[]; overviews: Record<string, string>; conflicts: unknown[] } }>(`${root}catalog.json`, signal);
  const mapEntries = new Map(Object.entries(doc.maps).map(([id, m]) => [id, entry(id, m.name, m.width, m.height, true, `${m.primary} ${m.secondary} ${m.section}`)]));
  return {
    game, title: game === "firered" ? "Kanto · FireRed" : "Hoenn · Emerald", commit: doc._meta.sourceCommit,
    limitations: "Tiles y paletas estáticos. Los objetos representan los templates de la fuente, no una partida guardada. Animación, audio y análisis de flags disponibles en el inspector anterior.", maps: mapEntries,
    world: { width: doc.world.w, height: doc.world.h, origin: doc.world.origin, rects: doc.world.maps, notes: `${doc.world.conflicts.length} discrepancias de conexiones registradas. Las zonas sin mapa quedan vacías; el relleno decorativo no es terreno del juego.` },
    capabilities: { explore: true, sprites: true, collision: true, times: [] },
    textures(id, _time, layers, overview) {
      if (id !== "world") {
        const m = doc.maps[id]; if (!m) return [];
        return ([ ["base", m.image], ["sprites", m.sprites], ["collision", m.collision] ] as [Layer, string | null][])
          .filter(([layer, file]) => layers.has(layer) && file).map(([layer, file]) => texture(root + file, 0, 0, m.width, m.height, layer));
      }
      const layerOf = (kind: string): Layer => kind === "image" ? "base" : kind as Layer;
      if (overview) {
        const scale = Math.min(1, 2048 / Math.max(doc.world.w, doc.world.h));
        return Object.entries(doc.world.overviews).filter(([kind]) => layers.has(layerOf(kind))).map(([kind, file]) => texture(root + file, 0, 0, doc.world.w, doc.world.h, layerOf(kind), scale));
      }
      return doc.world.chunks.filter(c => layers.has(layerOf(c.layer))).map(c => texture(root + c.file, c.x, c.y, c.w, c.h, layerOf(c.layer)));
    },
    async details(id, detailSignal) {
      const m = await json<Record<string, unknown> & { connections: { map: string; direction: string; offset: number }[]; warps: Record<string, unknown>[]; objects: Record<string, unknown>[]; bgs: Record<string, unknown>[]; coords: Record<string, unknown>[] }>(doc.maps[id].detail, detailSignal);
      return { info: { layout: m.layout, music: m.musicName, section: m.regionMapSectionName, primary: doc.maps[id].primary, secondary: doc.maps[id].secondary },
        connections: m.connections.map(c => ({ destination: c.map, direction: c.direction, offset: c.offset })),
        events: events([["warp", m.warps], ["object", m.objects], ["bg", m.bgs], ["coord", m.coords]], "destMap", "destWarpId") };
    },
    inspector: id => `/viewer.html?legacy=1${game === "emerald" ? "&game=emerald" : ""}${id === "world" ? "" : `#mapa=${encodeURIComponent(id)}`}`,
  };
}

async function hns(signal: AbortSignal): Promise<Source> {
  type M = { id: string; name: string; w: number; h: number; image: string | null; unavailable?: string; primary: string; secondary: string; section: string; layout: string; music: string; connections: { map: string; direction: string; offset: number }[]; warps: Record<string, unknown>[]; objects: Record<string, unknown>[]; bgs: Record<string, unknown>[]; coords: Record<string, unknown>[] };
  const doc = await json<{ _meta: { commit: string }; maps: Record<string, M>; world: { w: number; h: number; maps: Rect[]; chunks: { file: string; x: number; y: number; w: number; h: number }[]; conflicts: unknown[]; unavailable: string[] } }>("/hns/maps.json", signal);
  return { game: "hns", title: "Johto / Kanto · Heart & Soul", commit: doc._meta.commit,
    limitations: "Adaptación GBA de HnS. Tiles estáticos; objetos como marcadores. Sin animación, horario, audio, scripts ni exploración jugable.",
    maps: new Map(Object.entries(doc.maps).map(([id, m]) => [id, entry(id, m.name, m.w * 16, m.h * 16, !!m.image, `${m.primary} ${m.secondary}`, m.unavailable)])),
    world: { width: doc.world.w, height: doc.world.h, origin: "MAP_NEW_BARK_TOWN", rects: doc.world.maps, notes: `${doc.world.conflicts.length} discrepancias de conexiones; ${doc.world.unavailable.length} mapa(s) sin render. Incluye variantes superpuestas y áreas especiales de la fuente.` },
    capabilities: { explore: false, sprites: false, collision: false, times: [] },
    textures(id, _time, layers, overview) {
      if (!layers.has("base")) return [];
      if (id !== "world") { const m = doc.maps[id]; return m?.image ? [texture(`/hns/${m.image}`, 0, 0, m.w * 16, m.h * 16, "base")] : []; }
      if (overview) return [texture("/map-viewer/hns/world/overview.png", 0, 0, doc.world.w, doc.world.h, "base", Math.min(1, 2048 / Math.max(doc.world.w, doc.world.h)))];
      return doc.world.chunks.map(c => texture(`/hns/${c.file}`, c.x, c.y, c.w, c.h, "base"));
    },
    async details(id, _signal) {
      const m = doc.maps[id];
      return { info: { layout: m.layout, music: m.music, section: m.section, primary: m.primary, secondary: m.secondary },
        connections: m.connections.map(c => ({ destination: c.map, direction: c.direction, offset: c.offset })),
        events: events([["warp", m.warps], ["object", m.objects], ["bg", m.bgs], ["coord", m.coords]], "dest_map", "dest_warp_id") };
    }, inspector: () => null,
  };
}

async function crystal(signal: AbortSignal): Promise<Source> {
  type M = { name: string; w: number; h: number; tileset: string; environment: string; landmark: string; music: string; default: string; times: string[]; objTimes?: string[]; objLayer?: boolean; connections: { map: string; direction: string; offset: number }[]; warps: Record<string, unknown>[]; objects: Record<string, unknown>[]; bgs: Record<string, unknown>[]; coords: Record<string, unknown>[] };
  type Tile = { file: string; x: number; y: number; w: number; h: number };
  const [doc, world] = await Promise.all([
    json<{ commit: string; maps: M[] }>("/crystal/maps.json", signal),
    json<{ w: number; h: number; maps: { name: string; x: number; y: number; w: number; h: number }[]; tiles: Tile[]; spriteTiles: Tile[]; sections: { conflicts: unknown[] }[]; overlaps: unknown[]; note: string }>("/crystal/world/world.json", signal),
  ]);
  const byId = new Map(doc.maps.map(m => [m.name, m]));
  const width = world.w * 32, height = world.h * 32;
  return { game: "crystal", title: "Johto / Kanto · Crystal", commit: doc.commit,
    limitations: "Gráficos GBC. Paletas de mañana/día/noche según disponibilidad del mapa; sprites estáticos. La colocación entre regiones es editorial; enlaces por interiores disponibles en el inspector anterior.",
    maps: new Map(doc.maps.map(m => [m.name, entry(m.name, m.name, m.w * 32, m.h * 32, true, `${m.tileset} ${m.landmark}`)])),
    world: { width, height, origin: "NewBarkTown", rects: world.maps.map(m => ({ id: m.name, x: m.x * 32, y: m.y * 32, w: m.w * 32, h: m.h * 32 })), notes: `${world.overlaps.length} solapes registrados. ${world.note}` },
    capabilities: { explore: false, sprites: true, collision: false, times: ["morn", "day", "nite"] },
    textures(id, time, layers, overview) {
      if (id !== "world") {
        const m = byId.get(id); if (!m) return [];
        const t = m.times.includes(time) ? time : m.default;
        const files: [Layer, string][] = [];
        if (layers.has("base")) files.push(["base", `/crystal/maps/${m.name}${t === m.default ? "" : `_${t}`}.png`]);
        if (layers.has("sprites") && m.objLayer) files.push(["sprites", `/crystal/maps/${m.name}_obj${t !== m.default && m.objTimes?.includes(t) ? `_${t}` : ""}.png`]);
        return files.map(([layer, file]) => texture(file, 0, 0, m.w * 32, m.h * 32, layer));
      }
      if (overview) {
        const scale = Math.min(1, 2048 / Math.max(width, height));
        return ([ ["base", "overview.png"], ["sprites", "overview_obj.png"] ] as [Layer, string][]).filter(([layer]) => layers.has(layer)).map(([layer, file]) => texture(`/map-viewer/crystal/world/${time}/${file}`, 0, 0, width, height, layer, scale));
      }
      return ([ ["base", world.tiles], ["sprites", world.spriteTiles] ] as [Layer, Tile[]][]).filter(([layer]) => layers.has(layer)).flatMap(([layer, tiles]) => tiles.map(t => texture(`/crystal/world/${time}/${t.file}`, t.x, t.y, t.w, t.h, layer)));
    },
    async details(id, _signal): Promise<MapDetail> {
      const m = byId.get(id)!;
      return { info: { tileset: m.tileset, music: m.music, section: m.landmark, environment: m.environment, group: (m as M & { group: number }).group, availableTimes: m.times },
        connections: m.connections.map(c => ({ destination: c.map, direction: c.direction, offset: c.offset })),
        events: events([["warp", m.warps], ["object", m.objects], ["bg", m.bgs], ["coord", m.coords]], "dest", "warp") };
    }, inspector: id => `/crystal-world.html?legacy=1${id === "world" ? "" : `#${encodeURIComponent(id)}`}`,
  };
}

async function principal(signal: AbortSignal): Promise<Source> {
  type M = { id: string; sourceId: string; game: "firered" | "emerald" | "hns"; region: string; name: string; width: number; height: number; image: string | null; section: string };
  type Chunk = { file: string; layer: "image" | "sprites" | "collision"; x: number; y: number; w: number; h: number };
  const root = "/map-viewer/principal/";
  const [doc, fr, em, hs] = await Promise.all([
    json<{ regions: Region[]; maps: Record<string, M>; crossSourceAliases: Record<string, string>; travels: Journey[]; places: { id: string; label: string }[];
      world: { w: number; h: number; origin: string; maps: Rect[]; chunks: Chunk[]; overviews: Record<string, string> } }>(root + "catalog.json", signal),
    gba("firered", signal), gba("emerald", signal), hns(signal),
  ]);
  const providers = { firered: fr, emerald: em, hns: hs };
  const mapEntries = new Map(Object.entries(doc.maps).map(([id, m]) => {
    const original = providers[m.game].maps.get(m.sourceId)!;
    return [id, { ...original, id, name: `${doc.regions.find(r => r.id === m.region)!.title} · ${original.name}`,
      searchable: `${m.region}${original.searchable}`, region: m.region, originGame: m.game, originId: m.sourceId }];
  }));
  const sourceIds = new Map([...mapEntries.values()].map(m => [`${m.originGame}/${m.originId}`, m.id]));
  const translate = (m: M, target: string): { destination: string; referenceUrl?: string; crossSource: boolean } => {
    const local = `${m.region}/${target}`;
    if (mapEntries.has(local)) return { destination: local, crossSource: false };
    const sameSource = sourceIds.get(`${m.game}/${target}`);
    if (sameSource) return { destination: sameSource, crossSource: false };
    const alias = m.game === "hns" ? doc.crossSourceAliases[target] : undefined;
    if (alias && mapEntries.has(alias)) return { destination: alias, crossSource: true };
    return { destination: target, referenceUrl: `/maps.html?game=${m.game}#mapa=${encodeURIComponent(target)}`, crossSource: false };
  };
  return {
    game: "world", title: "Mundo principal · Kanto / Johto / Hoenn", commit: doc.regions.map(r => `${r.title}:${r.commit.slice(0, 7)}`).join(" · "),
    limitations: "Kanto y Sevii: FireRed · Johto: HnS · Hoenn: Emerald. Disposición y viajes del atlas definidos por el proyecto. Sin unión física ni simulación compartida. Johto usa marcadores; sprites/colisión de bloques disponibles en Kanto y Hoenn.",
    maps: mapEntries, regions: doc.regions, journeys: doc.travels, places: doc.places.map(p => ({ ...p, label: pretty(p.label) })),
    world: { width: doc.world.w, height: doc.world.h, origin: doc.world.origin, rects: doc.world.maps,
      notes: "Kanto, su archipiélago Sevii, Johto y Hoenn. Las siete islas y los componentes se colocan separados; Hoenn conserva su plano continental y agrupa sus superficies aisladas en una franja aparte; la posición relativa es editorial. HnS conserva discrepancias de conexiones de origen, pendientes de revisión. Áreas fronterizas de HnS (Routes 26–28, Tohjo Falls y Mt Silver) se conservan con Johto. Los viajes son navegación del atlas, no transporte jugable." },
    capabilities: { explore: true, sprites: true, collision: true, times: [] },
    textures(id, time, layers, overview) {
      if (id !== "world") { const m = doc.maps[id]; return m ? providers[m.game].textures(m.sourceId, time, layers, false) : []; }
      const layerOf = (kind: string): Layer => kind === "image" ? "base" : kind as Layer;
      if (overview) {
        const scale = Math.min(1, 2048 / Math.max(doc.world.w, doc.world.h));
        return Object.entries(doc.world.overviews).filter(([kind]) => layers.has(layerOf(kind))).map(([kind, file]) => texture(root + file, 0, 0, doc.world.w, doc.world.h, layerOf(kind), scale));
      }
      return doc.world.chunks.filter(c => layers.has(layerOf(c.layer))).map(c => texture(root + c.file, c.x, c.y, c.w, c.h, layerOf(c.layer)));
    },
    async details(id, detailSignal) {
      const m = doc.maps[id], original = await providers[m.game].details(m.sourceId, detailSignal);
      return { info: { region: m.region, source: m.game, sourceMap: m.sourceId, ...original.info },
        connections: original.connections.map(c => ({ ...c, ...translate(m, c.destination) })),
        events: original.events.map(e => {
          if (!e.destination) return e;
          const target = translate(m, e.destination);
          return { ...e, destination: target.destination, referenceUrl: target.referenceUrl,
            destinationWarp: target.crossSource ? undefined : e.destinationWarp,
            details: { ...e.details, ...(target.crossSource ? { atlasPolicy: "Cross-source navigation reference; original warp index not transferred" } : {}) } };
        }) };
    },
    exploreLink(id, zoom) {
      const m = doc.maps[id];
      if (!m || m.game === "hns" || !providers[m.game].world.rects.some(r => r.id === m.sourceId)) return null;
      return `/viewer.html${m.game === "emerald" ? "?game=emerald" : ""}#modo=explore&mapa=${encodeURIComponent(m.sourceId)}&z=${zoom}`;
    },
    inspector(id) { const m = doc.maps[id]; return m ? providers[m.game].inspector(m.sourceId) : null; },
  };
}

export function loadSource(game: GameId, signal: AbortSignal): Promise<Source> {
  if (game === "world") return principal(signal);
  return game === "hns" ? hns(signal) : game === "crystal" ? crystal(signal) : gba(game, signal);
}
