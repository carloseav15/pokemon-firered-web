import { TILE } from "./constants";
import type { ViewerClock } from "./clock";
import { loadViewerEffectTemplates, type EffectTemplate, type EffectTemplateName } from "./data/fieldFxTemplates";
import type { Direction } from "./render/sprites";
import type { WorldGrid } from "./data/worldGrid";
import type { PlayerVehicle } from "./state";
import * as C from "../fr/generated/constants";
import { BIKE_TRACK_TRANSITIONS, TRACK_ROW_WIDTH, TRACK_INDEX_OFFSET, TRACK_HOLD_TICKS, TRACK_END_TICK } from "./generated/trackEffects";
import * as MB from "../fr/generated/metatileBehavior";

export type EffectPhase = "spawn" | "begin" | "finish";
export type GroundActor = Readonly<{ x: number; y: number; previousX: number; previousY: number; direction: Direction; previousDirection: Direction; landingJump: boolean; vehicle?: PlayerVehicle }>;
export type FieldEffectSpawn = Readonly<{
  type: "spawn"; id: number; generation: number; tick: number;
  template: EffectTemplate; animation: number; startCommand: number; initialExtraTicks: 0 | 1;
  phase: EffectPhase; direction: Direction; previousDirection: Direction;
  position: Readonly<{ tileX: number; tileY: number; xPx: number; yPx: number }>;
  priority: Readonly<{ oamPriority: number; subpriority: number; domZIndex: number }>;
  // TallGrass stays after E until it has left both current and previous cells.
  retainUntilLeave: boolean;
  lifetime?: Readonly<{ holdTicks: number; endTick: number }>;
}>;
export type FieldEffectEvent = FieldEffectSpawn
  | Readonly<{ type: "release"; id: number; generation: number }>
  | Readonly<{ type: "clear"; generation: number }>;

/** Source-backed ground effect activation; presentation belongs to render/fieldFx.ts. */
export class ViewerFieldEffects {
  private listeners = new Set<(event: FieldEffectEvent) => void>();
  private grass = new Map<string, number>();
  private nextId = 0;
  private sessionGeneration = 0;
  get generation(): number { return this.sessionGeneration; }
  private constructor(private readonly grid: WorldGrid, private readonly clock: ViewerClock, private readonly templates: ReadonlyMap<EffectTemplateName, EffectTemplate>) {}

  static async create(grid: WorldGrid, clock: ViewerClock): Promise<ViewerFieldEffects> {
    return new ViewerFieldEffects(grid, clock, await loadViewerEffectTemplates());
  }
  subscribe(listener: (event: FieldEffectEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  resetSession(): void {
    this.sessionGeneration++;
    this.grass.clear();
    this.emit(Object.freeze({ type: "clear", generation: this.generation }));
  }
  private emit(event: FieldEffectEvent): void {
    for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener(event);
  }
  onGroundStep(phase: EffectPhase, actor: GroundActor): void {
    if (!this.grid.inBounds(actor.x, actor.y)) return;
    const key = `${actor.x},${actor.y}`, previous = `${actor.previousX},${actor.previousY}`;
    for (const [cell, id] of this.grass) {
      if (cell !== key && cell !== previous) {
        this.grass.delete(cell);
        this.emit(Object.freeze({ type: "release", id, generation: this.generation }));
      }
    }
    const behavior = this.grid.behaviors[this.grid.idx(actor.x, actor.y)];
    if ((phase === "spawn" || phase === "begin") && MB.MetatileBehavior_IsTallGrass(behavior) && !this.grass.has(key)) {
      this.grass.set(key, this.spawn("TallGrass", phase, actor, phase === "spawn" ? 4 : 0, 2, 0, 0, true));
    }
    // Tracks are emitted on begin-step at previousCoords, from previous behavior.
    if (phase === "begin" && actor.vehicle !== "surf" && (actor.x !== actor.previousX || actor.y !== actor.previousY)
      && this.grid.inBounds(actor.previousX, actor.previousY)) {
      const previousBehavior = this.grid.behaviors[this.grid.idx(actor.previousX, actor.previousY)];
      const deep = MB.MetatileBehavior_IsDeepSand(previousBehavior);
      if (deep || MB.MetatileBehavior_IsSand(previousBehavior) || MB.MetatileBehavior_IsFootprints(previousBehavior)) {
        const directions = { south: C.DIR_SOUTH, north: C.DIR_NORTH, west: C.DIR_WEST, east: C.DIR_EAST };
        const facing = directions[actor.direction];
        // C addresses a contiguous u8[4][4] with facingDirection - 5;
        // flattening preserves its GBA byte address without negative JS indices.
        const animation = actor.vehicle === "bike"
          ? BIKE_TRACK_TRANSITIONS[directions[actor.previousDirection] * TRACK_ROW_WIDTH + facing - TRACK_INDEX_OFFSET]
          : facing;
        this.spawn(actor.vehicle === "bike" ? "BikeTireTracks" : deep ? "DeepSandFootprints" : "SandFootprints",
          phase, { ...actor, x: actor.previousX, y: actor.previousY }, 0, 2, 149, 0, false, animation,
          Object.freeze({ holdTicks: TRACK_HOLD_TICKS, endTick: TRACK_END_TICK }));
      }
    }
    // event_object_movement.c: GetAllGroundEffectFlags_OnFinishStep / HasRipples.
    if (phase === "finish" && MB.MetatileBehavior_HasRipples(behavior)) this.spawn("Ripple", phase, actor, 0, 3, 151, -2, false);
    if (phase === "finish" && actor.landingJump && !MB.MetatileBehavior_IsTallGrass(behavior)
      && !MB.MetatileBehavior_IsLongGrass(behavior) && !MB.MetatileBehavior_IsPuddle(behavior)
      && !MB.MetatileBehavior_IsSurfable(behavior) && !MB.MetatileBehavior_IsShallowFlowingWater(behavior)) {
      this.spawn("GroundImpactDust", phase, actor, 0, 2, 0, 8, false);
    }
  }
  private spawn(name: EffectTemplateName, phase: EffectPhase, actor: GroundActor, startCommand: number, oamPriority: number, subpriority: number, yOffset: number, retainUntilLeave: boolean, animation = 0, lifetime?: FieldEffectSpawn["lifetime"]): number {
    const id = ++this.nextId;
    this.emit(Object.freeze({ type: "spawn", id, generation: this.generation, tick: this.clock.tick,
      template: this.templates.get(name)!, animation, startCommand,
      // sprite.c SeekSpriteAnim adds one delay tick when its frame delay is nonzero.
      initialExtraTicks: name === "TallGrass" && phase === "spawn" ? 1 : 0, phase,
      direction: actor.direction, previousDirection: actor.previousDirection,
      position: Object.freeze({ tileX: actor.x, tileY: actor.y, xPx: actor.x * TILE, yPx: actor.y * TILE + yOffset }),
      // DOM stacking remains the existing viewer adaptation; full elevation/depth is C7 pending.
      priority: Object.freeze({ oamPriority, subpriority, domZIndex: 26 }), retainUntilLeave, lifetime,
    }));
    return id;
  }
}
