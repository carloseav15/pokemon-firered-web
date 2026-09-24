export type Direction = "south" | "north" | "west" | "east";

export type GridPoint = { x: number; y: number };

export type MapObjectEvent = {
  local_id?: string;
  type?: string;
  graphics_id: string;
  x: number;
  y: number;
  elevation?: number;
  movement_type?: string;
  movement_range_x?: number;
  movement_range_y?: number;
  script?: string;
  flag?: string;
  trainer_type?: string;
  trainer_sight_or_berry_tree_id?: string;
};

export type WarpEvent = {
  x: number;
  y: number;
  dest_map: string;
  dest_warp_id?: string;
};

export type BackgroundEvent = {
  x: number;
  y: number;
  script?: string;
};

export type MapConnection = {
  direction?: "north" | "south" | "west" | "east" | "up" | "down" | "left" | "right";
  map?: string;
  dest_map?: string;
  offset?: number;
};

export type MapData = {
  id: string;
  name: string;
  width: number;
  height: number;
  base: string;
  foreground: string;
  music?: string;
  showMapName?: boolean;
  collision: number[][];
  behavior: number[][];
  elevation?: number[][];
  terrain?: number[][];
  objectEvents: MapObjectEvent[];
  warpEvents: WarpEvent[];
  backgroundEvents: BackgroundEvent[];
  connections?: MapConnection[];
};

export type RuntimeObject = MapObjectEvent & {
  id: string;
  solid: boolean;
  active: boolean;
};

export type WorldState = {
  mapId: string;
  player: {
    position: GridPoint;
    facing: Direction;
    moving: boolean;
    surfing: boolean;
  };
  objects: RuntimeObject[];
  flags: Record<string, boolean>;
  variables: Record<string, number | string>;
};

export type EngineEvent =
  | { type: "step"; from: GridPoint; to: GridPoint; direction: Direction }
  | { type: "blocked"; position: GridPoint; direction: Direction }
  | { type: "warp"; warp: WarpEvent }
  | { type: "connection"; connection: MapConnection }
  | { type: "interact"; object?: RuntimeObject; event?: BackgroundEvent }
  | { type: "dialogue"; lines: string[] }
  | { type: "transition-start"; mapId: string }
  | { type: "transition-end"; mapId: string }
  | { type: "terrain"; position: GridPoint; effect: string };

export type EngineListener = (event: EngineEvent) => void;
