// special_field_anim.c escalator tile task and field_effect.c escalator warp tasks,
// shared by the engine (Overworld) and the streaming viewer through small hosts.
import * as C from "@game/generated/constants";
import { tasks as defaultTasks, type TaskManager } from "../gba/tasks";
import { Cos, Sin } from "../hw/trig";
import { rom } from "../rom";

const MAPGRID_COLLISION_MASK = 0x0c00;

export type EscalatorMapHost = {
  metatileIdAt(x: number, y: number): number;
  setMetatileIdAt(x: number, y: number, metatile: number): void;
};

const escalatorTiles = [
  ["METATILE_PokemonCenter_Escalator_BottomNextRail_Transition2", "METATILE_PokemonCenter_Escalator_BottomNextRail_Transition1", "METATILE_PokemonCenter_Escalator_BottomNextRail_Normal"],
  ["METATILE_PokemonCenter_Escalator_BottomRail_Transition2", "METATILE_PokemonCenter_Escalator_BottomRail_Transition1", "METATILE_PokemonCenter_Escalator_BottomRail_Normal"],
  ["METATILE_PokemonCenter_Escalator_BottomNext_Transition2", "METATILE_PokemonCenter_Escalator_BottomNext_Transition1", "METATILE_PokemonCenter_Escalator_BottomNext_Normal"],
  ["METATILE_PokemonCenter_Escalator_Bottom_Transition2", "METATILE_PokemonCenter_Escalator_Bottom_Transition1", "METATILE_PokemonCenter_Escalator_Bottom_Normal"],
  ["METATILE_PokemonCenter_Escalator_TopNext_Normal", "METATILE_PokemonCenter_Escalator_TopNext_Transition1", "METATILE_PokemonCenter_Escalator_TopNext_Transition2"],
  ["METATILE_PokemonCenter_Escalator_Top_Normal", "METATILE_PokemonCenter_Escalator_Top_Transition1", "METATILE_PokemonCenter_Escalator_Top_Transition2"],
  ["METATILE_PokemonCenter_Escalator_TopNextRail_Normal", "METATILE_PokemonCenter_Escalator_TopNextRail_Transition1", "METATILE_PokemonCenter_Escalator_TopNextRail_Transition2"],
] as const;

/** Task_DrawEscalator / CreateEscalatorTask / StartEscalator / StopEscalator / IsEscalatorMoving (special_field_anim.c). */
export class EscalatorTiles {
  private taskId = 0;
  private readonly run = (id: number): void => this.Task_DrawEscalator(id);
  constructor(
    private readonly map: EscalatorMapHost,
    private readonly playerCoords: () => { x: number; y: number },
    private readonly scheduler: TaskManager = defaultTasks,
    /** Metatile constant lookup; the viewer has no global Rom instance. */
    private readonly metatileId: (name: string) => number = name => rom.c(name),
  ) {}

  private SetEscalatorMetatile(taskId: number, tiles: readonly string[], mask: number): void {
    const data = this.scheduler.data(taskId);
    const x = data[4]! - 1, y = data[5]! - 1, stage = data[1]!;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const mx = x + col, my = y + row;
      const current = this.map.metatileIdAt(mx, my);
      if (!data[2]) {
        const from = this.metatileId(tiles[stage]!);
        if (current === from) this.map.setMetatileIdAt(mx, my, mask | this.metatileId(tiles[stage === 2 ? 0 : stage + 1]!));
      } else {
        const from = this.metatileId(tiles[2 - stage]!);
        if (current === from) this.map.setMetatileIdAt(mx, my, mask | this.metatileId(tiles[stage === 2 ? 2 : 1 - stage]!));
      }
    }
  }

  private Task_DrawEscalator(taskId: number): void {
    const data = this.scheduler.data(taskId);
    data[3] = 1;
    switch (data[0]) {
      case 0: this.SetEscalatorMetatile(taskId, escalatorTiles[0], 0); break;
      case 1: this.SetEscalatorMetatile(taskId, escalatorTiles[1], 0); break;
      case 2: this.SetEscalatorMetatile(taskId, escalatorTiles[2], MAPGRID_COLLISION_MASK); break;
      case 3: this.SetEscalatorMetatile(taskId, escalatorTiles[3], 0); break;
      case 4: this.SetEscalatorMetatile(taskId, escalatorTiles[4], MAPGRID_COLLISION_MASK); break;
      case 5: this.SetEscalatorMetatile(taskId, escalatorTiles[5], 0); break;
      case 6: this.SetEscalatorMetatile(taskId, escalatorTiles[6], 0); break;
    }
    data[0] = (data[0]! + 1) & 7;
    if (data[0] === 0) { data[1] = (data[1]! + 1) % 3; data[3] = 0; }
  }

  /** StartEscalator: CreateEscalatorTask captures the player's coords and draws the first section at once. */
  StartEscalator(goingUp: boolean): void {
    this.taskId = this.scheduler.create(this.run, 0);
    const data = this.scheduler.data(this.taskId);
    const p = this.playerCoords();
    data[0] = 0; data[1] = 0; data[2] = goingUp ? 1 : 0; data[3] = 0;
    data[4] = p.x; data[5] = p.y;
    this.Task_DrawEscalator(this.taskId);
  }

  StopEscalator(): void { this.scheduler.destroy(this.taskId); }

  /** data[0] of the draw task, or -1 when it is not running. */
  get drawState(): number { return this.scheduler.isActive(this.run) ? this.scheduler.data(this.taskId)[0]! : -1; }

  IsEscalatorMoving(): boolean {
    const data = this.scheduler.data(this.taskId);
    return !!data[3] || data[1] !== 2;
  }
}

export type EscalatorWarpHost = {
  sprite(): { x2: number; y2: number };
  freezeObjects(): void;
  unfreezeObjects(): void;
  /** !IsMovementOverridden || ObjectEventClearHeldMovementIfFinished != 0 (EscalatorWarpEffect_2). */
  playerMovementReady(): boolean;
  /** ObjectEventSetHeldMovement with the face action of the current facing direction. */
  holdFacing(): void;
  faceRight(): void;
  /** ObjectEventClearHeldMovementIfFinished(player) != 0. */
  playerMovementFinished(): boolean;
  walkRight(): void;
  playEscalatorSound(): void;
  /** TryFadeOutOldMapMusic + WarpFadeOutScreen. */
  beginFadeOut(): void;
  /** !gPaletteFade.active && BGMusicStopped. */
  fadeFinished(): boolean;
  /** Install FieldCB_EscalatorWarpIn and WarpIntoMapAndLoad. */
  warpIntoMap(): void;
  destinationIsDownEscalator(): boolean;
  /** FieldCB_EscalatorWarpIn prologue: PlaySpecialMapMusic, WarpFadeInScreen, quest log header, lock controls. */
  beginWarpIn(): void;
  unlockControls(): void;
  questLog(direction: number): void;
};

/** Task_EscalatorWarpFieldEffect and Task_EscalatorWarpInFieldEffect (field_effect.c). */
export class EscalatorWarpAnimation {
  private outTaskId = -1;
  private inTaskId = -1;
  private readonly runOut = (id: number): void => this.Task_EscalatorWarpFieldEffect(id);
  private readonly runIn = (id: number): void => this.Task_EscalatorWarpInFieldEffect(id);
  constructor(
    private readonly host: EscalatorWarpHost,
    private readonly tiles: EscalatorTiles,
    private readonly scheduler: TaskManager = defaultTasks,
  ) {}

  get active(): boolean { return this.scheduler.isActive(this.runOut) || this.scheduler.isActive(this.runIn); }
  /** data[0] of the warp-out task, or -1 when it is not running. */
  get outStage(): number { return this.outTaskId >= 0 && this.scheduler.isActive(this.runOut) ? this.scheduler.data(this.outTaskId)[0]! : -1; }
  /** data[0] of the warp-in task, or -1 when it is not running. */
  get inStage(): number { return this.inTaskId >= 0 && this.scheduler.isActive(this.runIn) ? this.scheduler.data(this.inTaskId)[0]! : -1; }
  get stage(): number { return this.outStage >= 0 ? this.outStage : this.inStage; }

  /** StartEscalatorWarp (field_effect.c). */
  StartEscalatorWarp(metatileBehavior: number, priority: number): void {
    this.outTaskId = this.scheduler.create(this.runOut, priority);
    const data = this.scheduler.data(this.outTaskId);
    data[1] = metatileBehavior === C.MB_UP_ESCALATOR ? 1 : 0;
    data[15] = this.outTaskId;
  }

  /** FieldCB_EscalatorWarpIn after the map is loaded (field_effect.c). */
  FieldCB_EscalatorWarpIn(): void {
    this.host.beginWarpIn();
    this.host.freezeObjects();
    this.inTaskId = this.scheduler.create(this.runIn, 0);
    this.scheduler.data(this.inTaskId)[15] = this.inTaskId;
  }

  reset(): void {
    for (const [id, run] of [[this.outTaskId, this.runOut], [this.inTaskId, this.runIn]] as const) {
      if (id >= 0 && this.scheduler.isActive(run)) this.scheduler.destroy(id);
    }
    this.outTaskId = this.inTaskId = -1;
  }

  private Task_EscalatorWarpFieldEffect(taskId: number): void {
    const data = this.scheduler.data(taskId);
    const steps = [this.Out_1, this.Out_2, this.Out_3, this.Out_4, this.Out_5, this.Out_6] as const;
    while (steps[data[0]!]!.call(this, taskId)) { /* C returns TRUE to execute the next state this frame. */ }
  }

  private Out_1(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    this.host.freezeObjects();
    this.tiles.StartEscalator(data[1] !== 0);
    this.host.questLog(C.QL_ESCALATOR_OUT);
    data[0] = data[0]! + 1;
    return false;
  }

  private Out_2(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    if (this.host.playerMovementReady()) {
      this.host.holdFacing();
      data[0] = data[0]! + 1;
      data[2] = 0;
      data[3] = 0;
      if (data[1] === 0) data[0] = 4;
      this.host.playEscalatorSound();
    }
    return false;
  }

  private Out_3(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    this.AnimateGoingDown(taskId);
    if (data[2]! > 3) {
      this.host.beginFadeOut();
      data[0] = data[0]! + 1;
    }
    return false;
  }

  private Out_4(taskId: number): boolean {
    this.AnimateGoingDown(taskId);
    this.TransitionToWarpIn(taskId);
    return false;
  }

  private Out_5(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    this.AnimateGoingUp(taskId);
    if (data[2]! > 3) {
      this.host.beginFadeOut();
      data[0] = data[0]! + 1;
    }
    return false;
  }

  private Out_6(taskId: number): boolean {
    this.AnimateGoingUp(taskId);
    this.TransitionToWarpIn(taskId);
    return false;
  }

  private AnimateGoingDown(taskId: number): void {
    const data = this.scheduler.data(taskId);
    const sprite = this.host.sprite();
    sprite.x2 = Cos(0x84, data[2]!);
    sprite.y2 = Sin(0x94, data[2]!);
    data[3] = data[3]! + 1;
    if (data[3]! & 1) data[2] = data[2]! + 1;
  }

  private AnimateGoingUp(taskId: number): void {
    const data = this.scheduler.data(taskId);
    const sprite = this.host.sprite();
    sprite.x2 = Cos(0x7c, data[2]!);
    sprite.y2 = Sin(0x76, data[2]!);
    data[3] = data[3]! + 1;
    if (data[3]! & 1) data[2] = data[2]! + 1;
  }

  private TransitionToWarpIn(taskId: number): void {
    if (!this.host.fadeFinished()) return;
    this.tiles.StopEscalator();
    this.host.warpIntoMap();
    this.scheduler.destroy(taskId);
  }

  private Task_EscalatorWarpInFieldEffect(taskId: number): void {
    const data = this.scheduler.data(taskId);
    const steps = [this.In_1, this.In_2, this.In_3, this.In_4, this.In_5, this.In_6, this.In_7] as const;
    while (steps[data[0]!]!.call(this, taskId)) { /* C continues only when a state returns TRUE. */ }
  }

  private In_1(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    this.host.faceRight();
    let goingUp = true;
    data[0] = data[0]! + 1;
    data[1] = 16;
    if (this.host.destinationIsDownEscalator()) {
      goingUp = false;
      data[0] = 3;
    }
    this.tiles.StartEscalator(!goingUp);
    return true;
  }

  private In_2(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    const sprite = this.host.sprite();
    sprite.x2 = Cos(0x84, data[1]!);
    sprite.y2 = Sin(0x94, data[1]!);
    data[0] = data[0]! + 1;
    return false;
  }

  private In_3(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    const sprite = this.host.sprite();
    sprite.x2 = Cos(0x84, data[1]!);
    sprite.y2 = Sin(0x94, data[1]!);
    data[2] = data[2]! + 1;
    if (data[2]! & 1) data[1] = data[1]! - 1;
    if (data[1] === 0) { sprite.x2 = 0; sprite.y2 = 0; data[0] = 5; }
    return false;
  }

  private In_4(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    const sprite = this.host.sprite();
    sprite.x2 = Cos(0x7c, data[1]!);
    sprite.y2 = Sin(0x76, data[1]!);
    data[0] = data[0]! + 1;
    return false;
  }

  private In_5(taskId: number): boolean {
    const data = this.scheduler.data(taskId);
    const sprite = this.host.sprite();
    sprite.x2 = Cos(0x7c, data[1]!);
    sprite.y2 = Sin(0x76, data[1]!);
    data[2] = data[2]! + 1;
    if (data[2]! & 1) data[1] = data[1]! - 1;
    if (data[1] === 0) { sprite.x2 = 0; sprite.y2 = 0; data[0] = data[0]! + 1; }
    return false;
  }

  private In_6(taskId: number): boolean {
    if (this.tiles.IsEscalatorMoving()) return false;
    this.tiles.StopEscalator();
    const data = this.scheduler.data(taskId);
    data[0] = data[0]! + 1;
    return true;
  }

  private In_7(taskId: number): boolean {
    if (!this.host.playerMovementFinished()) return false;
    this.host.unlockControls();
    this.host.unfreezeObjects();
    this.host.walkRight();
    this.host.questLog(C.QL_ESCALATOR_IN);
    this.scheduler.destroy(taskId);
    return false;
  }
}
