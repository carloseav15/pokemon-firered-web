// Port of fieldmap.c: the backup map layout (VMap) with MAP_OFFSET padding,
// connections copied from neighbouring maps, borders and metatile attributes.

import { rom, type LayoutData, type MapConnection, type MapHeader, type TilesetData } from "../rom";

export const MAP_OFFSET = 7;
export const MAP_OFFSET_W = MAP_OFFSET * 2 + 1;
export const MAP_OFFSET_H = MAP_OFFSET * 2;
export const MAPGRID_METATILE_ID_MASK = 0x03ff;
export const MAPGRID_COLLISION_MASK = 0x0c00;
export const MAPGRID_ELEVATION_MASK = 0xf000;
export const MAPGRID_COLLISION_SHIFT = 10;
export const MAPGRID_ELEVATION_SHIFT = 12;
export const MAPGRID_UNDEFINED = 0x03ff;
export const NUM_METATILES_IN_PRIMARY = 640;
export const NUM_METATILES_TOTAL = 1024;
export const NUM_TILES_IN_PRIMARY = 640;

export const CONNECTION_INVALID = -1;
export const CONNECTION_NONE = 0;
export const CONNECTION_SOUTH = 1;
export const CONNECTION_NORTH = 2;
export const CONNECTION_WEST = 3;
export const CONNECTION_EAST = 4;
export const CONNECTION_DIVE = 5;
export const CONNECTION_EMERGE = 6;

export const METATILE_ATTRIBUTE_BEHAVIOR = 0;
export const METATILE_ATTRIBUTE_TERRAIN = 1;
export const METATILE_ATTRIBUTE_ENCOUNTER_TYPE = 4;
export const METATILE_ATTRIBUTE_LAYER_TYPE = 6;
export const METATILE_ATTRIBUTE_COUNT = 8;

const ATTR_MASKS = [0x000001ff, 0x00003e00, 0x0003c000, 0x00fc0000, 0x07000000, 0x18000000, 0x60000000, 0x80000000];
const ATTR_SHIFTS = [0, 9, 14, 18, 24, 27, 29, 31];

const DIRECTION_TO_CONNECTION: Record<string, number> = { down: CONNECTION_SOUTH, up: CONNECTION_NORTH, left: CONNECTION_WEST, right: CONNECTION_EAST, dive: CONNECTION_DIVE, emerge: CONNECTION_EMERGE };

export type LoadedConnection = { direction: number; offset: number; mapId: string; header: MapHeader; layout: LayoutData };

export type LoadedMap = {
  header: MapHeader;
  layout: LayoutData;
  primary: TilesetData;
  secondary: TilesetData;
  connections: LoadedConnection[];
};

export type MapPosition = { x: number; y: number };

/** Layouts that map scripts swap in with setmaplayoutindex (fetched with the map). */
const ALTERNATE_LAYOUTS: Record<string, string[]> = {
  MAP_SEAFOAM_ISLANDS_B3F: ["LAYOUT_SEAFOAM_ISLANDS_B3F_CURRENT_STOPPED"],
  MAP_SEAFOAM_ISLANDS_B4F: ["LAYOUT_SEAFOAM_ISLANDS_B4F_CURRENT_STOPPED"],
  MAP_THREE_ISLAND_DUNSPARCE_TUNNEL: ["LAYOUT_THREE_ISLAND_DUNSPARCE_TUNNEL_DUG_OUT"],
  MAP_SEVEN_ISLAND_HOUSE_ROOM1: ["LAYOUT_SEVEN_ISLAND_HOUSE_ROOM1_DOOR_OPEN"],
};

export async function loadMap(mapId: string, layoutOverride?: string): Promise<LoadedMap> {
  const loadedHeader = await rom.loadMap(mapId);
  const header = layoutOverride && layoutOverride !== loadedHeader.layout
    ? { ...loadedHeader, layout: layoutOverride }
    : loadedHeader;
  const layout = await rom.loadLayout(header.layout);
  await Promise.all((ALTERNATE_LAYOUTS[mapId] ?? []).map(async (id) => {
    const alt = await rom.loadLayout(id);
    await Promise.all([rom.loadTileset(alt.primary), rom.loadTileset(alt.secondary)]);
  }));
  const [primary, secondary] = await Promise.all([rom.loadTileset(layout.primary), rom.loadTileset(layout.secondary)]);
  const connections: LoadedConnection[] = [];
  for (const connection of header.connections) {
    const direction = DIRECTION_TO_CONNECTION[connection.direction];
    if (!direction || !rom.mapIndex.maps[connection.map]) continue;
    const other = await rom.loadMap(connection.map);
    const otherLayout = await rom.loadLayout(other.layout);
    connections.push({ direction, offset: connection.offset, mapId: connection.map, header: other, layout: otherLayout });
  }
  return { header, layout, primary, secondary, connections };
}

let sCurrentFieldMap: FieldMap | null = null;
export function SetCurrentFieldMap(map: FieldMap | null): void {
  sCurrentFieldMap = map;
}
export function GetCurrentFieldMap(): FieldMap | null {
  return sCurrentFieldMap;
}
export function MapGridGetMetatileBehaviorAt(x: number, y: number, map: FieldMap | null = sCurrentFieldMap): number {
  return map ? map.behaviorAt((x << 16) >> 16, (y << 16) >> 16) : 0;
}

/** MapGridGetElevationAt (fieldmap.c), with GBA s32 coordinate semantics. */
export function MapGridGetElevationAt(x: number, y: number, map: FieldMap | null = sCurrentFieldMap): number {
  return map ? map.elevationAt(x | 0, y | 0) & 0xff : 0;
}

/** MapGridGetCollisionAt (fieldmap.c), with GBA s32 coordinate semantics. */
export function MapGridGetCollisionAt(x: number, y: number, map: FieldMap | null = sCurrentFieldMap): number {
  return map ? map.collisionAt(x | 0, y | 0) & 0xff : 1;
}

/** MapGridGetMetatileIdAt (fieldmap.c), with GBA s32 coordinate semantics. */
export function MapGridGetMetatileIdAt(x: number, y: number, map: FieldMap | null = sCurrentFieldMap): number {
  return map ? map.metatileIdAt(x | 0, y | 0) >>> 0 : 0;
}

/** ExtractMetatileAttribute (fieldmap.c). METATILE_ATTRIBUTES_ALL returns the raw u32. */
export function ExtractMetatileAttribute(attributes: number, attributeType: number): number {
  const value = attributes >>> 0;
  if ((attributeType & 0xff) >= METATILE_ATTRIBUTE_COUNT) return value;
  return ((value & ATTR_MASKS[attributeType & 0xff]!) >>> ATTR_SHIFTS[attributeType & 0xff]!) >>> 0;
}

/** MapGridGetMetatileAttributeAt (fieldmap.c), whose coordinates are s16. */
export function MapGridGetMetatileAttributeAt(x: number, y: number, attributeType: number, map: FieldMap | null = sCurrentFieldMap): number {
  return map ? map.attributeAt((x << 16) >> 16, (y << 16) >> 16, attributeType & 0xff) >>> 0 : 0xff;
}

/** MapGridGetMetatileLayerTypeAt (fieldmap.c). */
export function MapGridGetMetatileLayerTypeAt(x: number, y: number, map: FieldMap | null = sCurrentFieldMap): number {
  return MapGridGetMetatileAttributeAt(x, y, METATILE_ATTRIBUTE_LAYER_TYPE, map) & 0xff;
}

/** GetMapBorderIdAt (fieldmap.c). */
export function GetMapBorderIdAt(x: number, y: number, map: FieldMap | null = sCurrentFieldMap): number {
  return map ? map.borderIdAt(x | 0, y | 0) : CONNECTION_INVALID;
}

/** GetIncomingConnection (fieldmap.c). */
export function GetIncomingConnection(direction: number, x: number, y: number, map: FieldMap | null = sCurrentFieldMap): LoadedConnection | undefined {
  return map?.incomingConnection(direction & 0xff, x | 0, y | 0);
}

/** GetMapConnectionAtPos (fieldmap.c), whose coordinates are s16. */
export function GetMapConnectionAtPos(x: number, y: number, map: FieldMap | null = sCurrentFieldMap): LoadedConnection | undefined {
  return map?.connectionAtPos((x << 16) >> 16, (y << 16) >> 16);
}

/** GetMapHeaderFromConnection (fieldmap.c). */
export function GetMapHeaderFromConnection(connection: LoadedConnection): MapHeader {
  return connection.header;
}


/** gMapHeader + VMap state. */
export class FieldMap {
  map!: Uint16Array;
  xSize = 0;
  ySize = 0;
  loaded!: LoadedMap;
  private flags = { south: false, north: false, west: false, east: false };

  get header(): MapHeader { return this.loaded.header; }
  get layout(): LayoutData { return this.loaded.layout; }

  /** Entry used by InitMap / InitMapFromSavedGame (fieldmap.c). */
  init(loaded: LoadedMap): void {
    this.InitMapLayoutData(loaded);
  }

  /** InitMapLayoutData (fieldmap.c). */
  InitMapLayoutData(loaded: LoadedMap): void {
    SetCurrentFieldMap(this);
    this.loaded = loaded;
    const layout = loaded.layout;
    this.xSize = layout.width + MAP_OFFSET_W;
    this.ySize = layout.height + MAP_OFFSET_H;
    this.map = new Uint16Array(this.xSize * this.ySize).fill(MAPGRID_UNDEFINED);
    this.InitBackupMapLayoutData(layout);
    this.InitBackupMapLayoutConnections();
  }

  /** InitBackupMapLayoutData (fieldmap.c). */
  private InitBackupMapLayoutData(layout: LayoutData): void {
    for (let y = 0; y < layout.height; y++) {
      const dest = this.xSize * (y + MAP_OFFSET) + MAP_OFFSET;
      this.map.set(layout.blocks.subarray(y * layout.width, (y + 1) * layout.width), dest);
    }
  }

  /** InitBackupMapLayoutConnections (fieldmap.c). */
  private InitBackupMapLayoutConnections(): void {
    this.flags = { south: false, north: false, west: false, east: false };
    for (const connection of this.loaded.connections) {
      switch (connection.direction) {
        case CONNECTION_SOUTH: this.FillSouthConnection(connection); this.flags.south = true; break;
        case CONNECTION_NORTH: this.FillNorthConnection(connection); this.flags.north = true; break;
        case CONNECTION_WEST: this.FillWestConnection(connection); this.flags.west = true; break;
        case CONNECTION_EAST: this.FillEastConnection(connection); this.flags.east = true; break;
      }
    }
  }

  /** FillConnection (fieldmap.c). */
  private FillConnection(x: number, y: number, c: LayoutData, x2: number, y2: number, width: number, height: number): void {
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const value = c.blocks[c.width * (y2 + i) + x2 + j];
        const dx = x + j;
        const dy = y + i;
        if (dx >= 0 && dy >= 0 && dx < this.xSize && dy < this.ySize && value !== undefined) this.map[this.xSize * dy + dx] = value;
      }
    }
  }

  private horizontalSpan(offset: number, cWidth: number): [number, number, number] {
    let x = offset + MAP_OFFSET;
    let x2: number;
    let width: number;
    if (x < 0) {
      x2 = -x;
      x += cWidth;
      width = x < this.xSize ? x : this.xSize;
      x = 0;
    } else {
      x2 = 0;
      width = x + cWidth < this.xSize ? cWidth : this.xSize - x;
    }
    return [x, x2, width];
  }

  private verticalSpan(offset: number, cHeight: number): [number, number, number] {
    let y = offset + MAP_OFFSET;
    let y2: number;
    let height: number;
    if (y < 0) {
      y2 = -y;
      height = y + cHeight < this.ySize ? y + cHeight : this.ySize;
      y = 0;
    } else {
      y2 = 0;
      height = y + cHeight < this.ySize ? cHeight : this.ySize - y;
    }
    return [y, y2, height];
  }

  /** FillSouthConnection (fieldmap.c). */
  private FillSouthConnection(c: LoadedConnection): void {
    const [x, x2, width] = this.horizontalSpan(c.offset, c.layout.width);
    this.FillConnection(x, this.layout.height + MAP_OFFSET, c.layout, x2, 0, width, MAP_OFFSET);
  }

  /** FillNorthConnection (fieldmap.c). */
  private FillNorthConnection(c: LoadedConnection): void {
    const [x, x2, width] = this.horizontalSpan(c.offset, c.layout.width);
    this.FillConnection(x, 0, c.layout, x2, c.layout.height - MAP_OFFSET, width, MAP_OFFSET);
  }

  /** FillWestConnection (fieldmap.c). */
  private FillWestConnection(c: LoadedConnection): void {
    const [y, y2, height] = this.verticalSpan(c.offset, c.layout.height);
    this.FillConnection(0, y, c.layout, c.layout.width - MAP_OFFSET, y2, MAP_OFFSET, height);
  }

  /** FillEastConnection (fieldmap.c). */
  private FillEastConnection(c: LoadedConnection): void {
    const [y, y2, height] = this.verticalSpan(c.offset, c.layout.height);
    this.FillConnection(this.layout.width + MAP_OFFSET, y, c.layout, 0, y2, MAP_OFFSET + 1, height);
  }

  private borderBlockAt(x: number, y: number): number {
    const layout = this.layout;
    const bx = (x - MAP_OFFSET + 8 * layout.borderWidth) % layout.borderWidth;
    const by = (y - MAP_OFFSET + 8 * layout.borderHeight) % layout.borderHeight;
    return (layout.border[bx + by * layout.borderWidth] | MAPGRID_COLLISION_MASK) & 0xffff;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.xSize && y >= 0 && y < this.ySize;
  }

  blockAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.map[x + this.xSize * y] : this.borderBlockAt(x, y);
  }

  elevationAt(x: number, y: number): number {
    const block = this.blockAt(x, y);
    if (block === MAPGRID_UNDEFINED) return 0;
    return block >> MAPGRID_ELEVATION_SHIFT;
  }

  collisionAt(x: number, y: number): number {
    const block = this.blockAt(x, y);
    if (block === MAPGRID_UNDEFINED) return 1;
    return (block & MAPGRID_COLLISION_MASK) >> MAPGRID_COLLISION_SHIFT;
  }

  metatileIdAt(x: number, y: number): number {
    const block = this.blockAt(x, y);
    if (block === MAPGRID_UNDEFINED) return this.borderBlockAt(x, y) & MAPGRID_METATILE_ID_MASK;
    return block & MAPGRID_METATILE_ID_MASK;
  }

  attributesOf(metatile: number): number {
    if (metatile < NUM_METATILES_IN_PRIMARY) return this.loaded.primary.attributes[metatile] ?? 0;
    if (metatile < NUM_METATILES_TOTAL) return this.loaded.secondary.attributes[metatile - NUM_METATILES_IN_PRIMARY] ?? 0;
    return 0xff;
  }

  metatileAttribute(metatile: number, type: number): number {
    return GetAttributeByMetatileIdAndMapLayout(this, metatile, type);
  }

  attributeAt(x: number, y: number, type: number): number {
    return this.metatileAttribute(this.metatileIdAt(x, y), type);
  }

  behaviorAt(x: number, y: number): number {
    return this.attributeAt(x, y, METATILE_ATTRIBUTE_BEHAVIOR);
  }

  setMetatileIdAt(x: number, y: number, metatile: number): void {
    if (!this.inBounds(x, y)) return;
    const i = x + y * this.xSize;
    this.map[i] = (this.map[i] & MAPGRID_ELEVATION_MASK) | (metatile & ~MAPGRID_ELEVATION_MASK & 0xffff);
    this.onChange?.(x, y);
  }

  /** MapGridSetMetatileEntryAt (fieldmap.c): unlike setMetatileIdAt, overwrites the whole grid
   * entry (elevation and collision bits included). */
  setMetatileEntryAt(x: number, y: number, metatile: number): void {
    if (!this.inBounds(x, y)) return;
    this.map[x + y * this.xSize] = metatile & 0xffff;
    this.onChange?.(x, y);
  }

  /** MapGridSetMetatileImpassabilityAt (fieldmap.c). */
  setMetatileImpassabilityAt(x: number, y: number, impassable: boolean): void {
    if (!this.inBounds(x, y)) return;
    const i = x + y * this.xSize;
    if (impassable) this.map[i] |= MAPGRID_COLLISION_MASK;
    else this.map[i] &= ~MAPGRID_COLLISION_MASK & 0xffff;
    this.onChange?.(x, y);
  }

  onChange?: (x: number, y: number) => void;

  /** GetMapBorderIdAt */
  borderIdAt(x: number, y: number): number {
    if (this.blockAt(x, y) === MAPGRID_UNDEFINED) return CONNECTION_INVALID;
    if (x >= this.xSize - (MAP_OFFSET + 1)) return this.flags.east ? CONNECTION_EAST : CONNECTION_INVALID;
    if (x < MAP_OFFSET) return this.flags.west ? CONNECTION_WEST : CONNECTION_INVALID;
    if (y >= this.ySize - MAP_OFFSET) return this.flags.south ? CONNECTION_SOUTH : CONNECTION_INVALID;
    if (y < MAP_OFFSET) return this.flags.north ? CONNECTION_NORTH : CONNECTION_INVALID;
    return CONNECTION_NONE;
  }

  /** GetIncomingConnection */
  incomingConnection(direction: number, x: number, y: number): LoadedConnection | undefined {
    for (const connection of this.loaded.connections) {
      if (connection.direction !== direction) continue;
      if (IsPosInIncomingConnectingMap(direction, x, y, connection, this)) return connection;
    }
    return undefined;
  }

  /** GetMapConnectionAtPos (VMap coordinates) */
  connectionAtPos(x: number, y: number): LoadedConnection | undefined {
    for (const connection of this.loaded.connections) {
      const d = connection.direction;
      if (d === CONNECTION_DIVE || d === CONNECTION_EMERGE
        || (d === CONNECTION_NORTH && y > MAP_OFFSET - 1)
        || (d === CONNECTION_SOUTH && y < this.layout.height + MAP_OFFSET)
        || (d === CONNECTION_WEST && x > MAP_OFFSET - 1)
        || (d === CONNECTION_EAST && x < this.layout.width + MAP_OFFSET)) continue;
      if (IsPosInConnectingMap(connection, x - MAP_OFFSET, y - MAP_OFFSET)) return connection;
    }
    return undefined;
  }
}

/** IsCoordInIncomingConnectingMap (fieldmap.c). */
function IsCoordInIncomingConnectingMap(coord: number, srcMax: number, destMax: number, offset: number): boolean {
  if (destMax + offset < srcMax) srcMax = destMax + offset;
  const offset2 = Math.max(offset, 0);
  return offset2 <= coord && coord <= srcMax;
}

/** IsPosInIncomingConnectingMap (fieldmap.c). */
function IsPosInIncomingConnectingMap(direction: number, x: number, y: number, connection: LoadedConnection, map: FieldMap): boolean {
  if (direction === CONNECTION_SOUTH || direction === CONNECTION_NORTH)
    return IsCoordInIncomingConnectingMap(x, map.layout.width, connection.layout.width, connection.offset);
  if (direction === CONNECTION_WEST || direction === CONNECTION_EAST)
    return IsCoordInIncomingConnectingMap(y, map.layout.height, connection.layout.height, connection.offset);
  return false;
}

/** IsCoordInConnectingMap (fieldmap.c). */
function IsCoordInConnectingMap(coord: number, max: number): boolean {
  return coord >= 0 && coord < max;
}

/** IsPosInConnectingMap (fieldmap.c). */
function IsPosInConnectingMap(connection: LoadedConnection, x: number, y: number): boolean {
  const direction = connection.direction;
  if (direction === CONNECTION_SOUTH || direction === CONNECTION_NORTH)
    return IsCoordInConnectingMap(x - connection.offset, connection.layout.width);
  if (direction === CONNECTION_WEST || direction === CONNECTION_EAST)
    return IsCoordInConnectingMap(y - connection.offset, connection.layout.height);
  return false;
}

/** GetAttributeByMetatileIdAndMapLayout (fieldmap.c). */
function GetAttributeByMetatileIdAndMapLayout(mapLayout: FieldMap, metatile: number, attributeType: number): number {
  let attributes: number;
  if (metatile < NUM_METATILES_IN_PRIMARY) attributes = mapLayout.loaded.primary.attributes[metatile] ?? 0;
  else if (metatile < NUM_METATILES_TOTAL) attributes = mapLayout.loaded.secondary.attributes[metatile - NUM_METATILES_IN_PRIMARY] ?? 0;
  else return 0xff;
  return ExtractMetatileAttribute(attributes, attributeType);
}

/** SaveMapView (fieldmap.c): persist the 15×14 tile window at the C save position. */
export function SaveMapView(map: FieldMap, position: MapPosition, mapView: number[]): void {
  let dst = 0;
  for (let y = position.y | 0; y < (position.y | 0) + MAP_OFFSET_H; y++) {
    for (let x = position.x | 0; x < (position.x | 0) + MAP_OFFSET_W; x++)
      mapView[dst++] = map.map[x + map.xSize * y] ?? 0;
  }
}

/** SavedMapViewIsEmpty (fieldmap.c, UBFIX build): inspect all 0x100 u16 entries. */
function SavedMapViewIsEmpty(mapView: number[]): boolean {
  for (let i = 0; i < 0x100; i++) if ((mapView[i] ?? 0) !== 0) return false;
  return true;
}

/** ClearSavedMapView (fieldmap.c). */
function ClearSavedMapView(mapView: number[]): void {
  mapView.fill(0, 0, 0x100);
}

/** LoadSavedMapView (fieldmap.c): restore a saved 15×14 region after map initialization. */
export function LoadSavedMapView(map: FieldMap, position: MapPosition, mapView: number[]): void {
  if (SavedMapViewIsEmpty(mapView)) return;
  let src = 0;
  for (let y = position.y | 0; y < (position.y | 0) + MAP_OFFSET_H; y++) {
    for (let x = position.x | 0; x < (position.x | 0) + MAP_OFFSET_W; x++)
      map.map[x + map.xSize * y] = mapView[src++] ?? 0;
  }
  ClearSavedMapView(mapView);
}

/** MoveMapViewToBackup (fieldmap.c): shift the saved overlap into a connected map's VMap. */
export function MoveMapViewToBackup(direction: number, map: FieldMap, position: MapPosition, mapView: number[]): void {
  const width = map.xSize;
  let x0 = position.x | 0;
  let y0 = position.y | 0;
  let x2 = MAP_OFFSET_W;
  let y2 = MAP_OFFSET_H;
  let srcX = 0;
  let srcY = 0;
  switch (direction & 0xff) {
    case CONNECTION_NORTH: y0++; y2 = MAP_OFFSET_H - 1; break;
    case CONNECTION_SOUTH: srcY = 1; y2 = MAP_OFFSET_H - 1; break;
    case CONNECTION_WEST: x0++; x2 = MAP_OFFSET_W - 1; break;
    case CONNECTION_EAST: srcX = 1; x2 = MAP_OFFSET_W - 1; break;
  }
  for (let y = 0; y < y2; y++) {
    for (let x = 0; x < x2; x++) {
      const src = (y + srcY) * MAP_OFFSET_W + srcX + x;
      const dst = x0 + x + width * (y + y0);
      map.map[dst] = mapView[src] ?? 0;
    }
  }
  ClearSavedMapView(mapView);
}

/** MapGridSetMetatileIdAt (fieldmap.c). */
export function MapGridSetMetatileIdAt(x: number, y: number, metatile: number, map: FieldMap | null = sCurrentFieldMap): void {
  map?.setMetatileIdAt(x | 0, y | 0, metatile & 0xffff);
}

/** MapGridSetMetatileEntryAt (fieldmap.c). */
export function MapGridSetMetatileEntryAt(x: number, y: number, metatile: number, map: FieldMap | null = sCurrentFieldMap): void {
  map?.setMetatileEntryAt(x | 0, y | 0, metatile & 0xffff);
}

/** MapGridSetMetatileImpassabilityAt (fieldmap.c). */
export function MapGridSetMetatileImpassabilityAt(x: number, y: number, impassable: boolean, map: FieldMap | null = sCurrentFieldMap): void {
  map?.setMetatileImpassabilityAt(x | 0, y | 0, impassable);
}

export function connectionForDirection(connections: MapConnection[], direction: string): MapConnection | undefined {
  return connections.find((c) => c.direction === direction);
}
