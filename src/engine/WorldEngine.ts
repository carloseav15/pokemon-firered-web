import { CollisionSystem } from "./CollisionSystem";
import { CameraSystem } from "./CameraSystem";
import { GameClock } from "./GameClock";
import { InputState } from "./InputState";
import { MapRuntime } from "./MapRuntime";
import { MovementSystem } from "./MovementSystem";
import { ObjectEventSystem } from "./ObjectEventSystem";
import { ScriptVM } from "./ScriptVM";
import { TaskScheduler } from "./TaskScheduler";
import { TransitionSystem } from "./TransitionSystem";
import type { Direction, EngineEvent, EngineListener, GridPoint, MapData, WorldState } from "./types";

export class WorldEngine {
  readonly clock = new GameClock();
  readonly tasks = new TaskScheduler();
  readonly input = new InputState();
  readonly camera = new CameraSystem();
  readonly transitions: TransitionSystem;
  readonly scripts: ScriptVM;
  private map: MapRuntime;
  private collision: CollisionSystem;
  private movement: MovementSystem;
  private objects: ObjectEventSystem;
  private state: WorldState;
  private listeners = new Set<EngineListener>();

  constructor(mapId: string, mapData: MapData, spawn: GridPoint) {
    this.map = new MapRuntime(mapData);
    this.camera.setBounds(mapData.width, mapData.height);
    this.state = this.map.createWorldState(mapId, spawn);
    this.collision = new CollisionSystem(this.map);
    this.transitions = new TransitionSystem((event) => this.emit(event));
    this.scripts = new ScriptVM((event) => this.emit(event));
    this.movement = new MovementSystem(this.map, this.collision, (event) => this.emit(event));
    this.objects = new ObjectEventSystem(this.movement, (event) => this.emit(event));
  }

  on(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get world(): WorldState { return this.state; }
  get mapData(): MapData { return this.map.data; }
  get collisionSystem(): CollisionSystem { return this.collision; }

  edgeConnection() {
    return this.map.connectionAtEdge(this.state.player.position, this.state.player.facing);
  }

  setFlag(flag: string, value = true): void {
    this.scripts.setFlag(this.state, flag, value);
  }

  clearFlag(flag: string): void {
    this.scripts.clearFlag(this.state, flag);
  }

  update(deltaMs: number): void {
    const frames = this.clock.advance(deltaMs);
    for (let frame = 0; frame < frames; frame++) {
      this.tasks.run(GameClock.FRAME_MS);
      this.objects.update(this.state, GameClock.FRAME_MS);
      this.scripts.run(this.state);
      this.camera.follow(this.state.player.position);
    }
    this.input.endFrame();
  }

  move(direction: Direction): boolean {
    if (this.state.player.moving || this.transitions.isBusy || this.scripts.isBusy) return false;
    return this.movement.movePlayer(this.state, direction);
  }

  forcedMove(): boolean {
    const direction = this.movement.forcedDirectionAt(this.state.player.position, this.state.player.facing);
    return direction ? this.movement.movePlayer(this.state, direction) : false;
  }

  interact(): boolean {
    if (this.scripts.isBusy || this.transitions.isBusy) return false;
    const target = this.interactionTarget();
    if (target.object) {
      const instructions = this.scripts.fromObject(target.object);
      if (instructions.length === 0) return false;
      this.scripts.load(instructions);
      this.emit({ type: "interact", object: target.object });
      return true;
    }
    if (target.event?.script) {
      const instructions = this.scripts.fromScriptName(target.event.script);
      if (instructions.length === 0) return false;
      this.scripts.load(instructions);
      this.emit({ type: "interact", event: target.event });
      return true;
    }
    return false;
  }

  interactionTarget(): { object?: WorldState["objects"][number]; event?: MapData["backgroundEvents"][number]; behavior: number } {
    const facing = this.movement.directionFor(this.state.player.position, this.collision.nextPosition(this.state.player.position, this.state.player.facing));
    const point = this.collision.nextPosition(this.state.player.position, facing);
    return { object: this.objects.interactionAt(this.state, point), event: this.map.backgroundEventAt(point), behavior: this.map.behaviorAt(point) };
  }

  replaceMap(mapId: string, mapData: MapData, spawn: GridPoint): void {
    // FireRed's flags and variables live in save blocks, not in a map. Keep
    // them when moving between imported maps so scene scripts remain valid.
    const flags = { ...this.state.flags };
    const variables = { ...this.state.variables };
    this.scripts.clear();
    this.tasks.clear();
    this.map = new MapRuntime(mapData);
    this.camera.setBounds(mapData.width, mapData.height);
    this.state = this.map.createWorldState(mapId, spawn);
    this.state.flags = flags;
    this.state.variables = variables;
    for (const object of this.state.objects) {
      if (object.flag && object.flag !== "0") object.active = flags[object.flag] !== true;
    }
    this.collision = new CollisionSystem(this.map);
    this.movement = new MovementSystem(this.map, this.collision, (event) => this.emit(event));
    this.objects = new ObjectEventSystem(this.movement, (event) => this.emit(event));
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
