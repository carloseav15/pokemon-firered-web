// field_tasks.c Task_RunPerStepCallback: the per-step callback a map script
// selects with setstepcallback. FireRed uses STEP_CB_ICE (Icefall Cave).

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { sound } from "../audio/sound";
import { rom } from "../rom";
import { flagGet, flagSet, varSet } from "../save";
import { random } from "../random";
import { DIRECTION_VECTORS } from "./objectEvents";
import { MAP_OFFSET } from "./fieldmap";
import type { Overworld } from "./overworld";

const ICEFALL_ICE_COORDS = [[8, 3], [10, 5], [15, 5], [8, 9], [9, 9], [16, 9], [8, 10], [9, 10], [8, 14]];

export class PerStepCallback {
  private id = C.STEP_CB_DUMMY;
  private data = new Array<number>(16).fill(0);
  private ambientCrySpecies = C.SPECIES_NONE;
  private ambientCryIsWaterMon = false;
  private ambientCryState = 0;
  private ambientCryDelay = 0;
  private setUp = false;

  constructor(private readonly ow: Overworld) {
    this.SetUpFieldTasks();
  }

  /** SetUpFieldTasks installs both persistent field tasks at priority 80. */
  SetUpFieldTasks(): void {
    if (this.setUp) return;
    this.setUp = true;
    this.ow.onFrame.push(() => { this.Task_RunPerStepCallback(); this.Task_RunTimeBasedEvents(); });
  }

  /** ActivatePerStepCallback */
  ActivatePerStepCallback(id: number): void {
    this.data.fill(0);
    // field_tasks.c: ActivatePerStepCallback falls back to STEP_CB_DUMMY
    // when callbackId is outside sPerStepCallbacks.
    const callbackCount = C.STEP_CB_CRACKED_FLOOR + 1;
    this.id = id >= 0 && id < callbackCount ? id : C.STEP_CB_DUMMY;
  }

  activate(id: number): void { this.ActivatePerStepCallback(id); }

  /** New maps start with the dummy callback until their scripts pick one. */
  reset(): void {
    this.ActivatePerStepCallback(C.STEP_CB_DUMMY);
    const local = this.ow.game.wild.getLocalWildMon();
    this.ambientCrySpecies = local.species;
    this.ambientCryIsWaterMon = local.isWaterMon;
  }

  /** ResetFieldTasksArgs resets the persistent ambient-cry task's local state. */
  ResetFieldTasksArgs(): void { this.ambientCryState = 0; this.ambientCryDelay = 0; }

  Task_RunPerStepCallback(): void {
    if (this.id === C.STEP_CB_ICE) this.IcefallCaveIcePerStepCallback();
    else if (this.id === C.STEP_CB_CRACKED_FLOOR) this.CrackedFloorPerStepCallback();
    else if (this.id === C.STEP_CB_ASH) this.AshGrassPerStepCallback();
    else this.DummyPerStepCallback();
  }

  /** DummyPerStepCallback: the source callback intentionally does nothing. */
  private DummyPerStepCallback(): void {}

  /** AshGrassPerStepCallback (field_tasks.c); unused by FireRed scripts. */
  AshGrassPerStepCallback(): void {
    const p = this.ow.player.object;
    if (!p) return;
    const x = p.currentCoords.x;
    const y = p.currentCoords.y;
    if (x === this.data[1] && y === this.data[2]) return;
    this.data[1] = x;
    this.data[2] = y;
    const behavior = this.ow.map.behaviorAt(x, y);
    if (!MB.MetatileBehavior_IsAshGrass(behavior)) return;
    const metatile = this.ow.map.metatileIdAt(x, y);
    this.ow.effects.StartAshFieldEffect(x, y,
      metatile === rom.c("METATILE_Fallarbor_AshGrass")
        ? rom.c("METATILE_Fallarbor_NormalGrass")
        : rom.c("METATILE_Lavaridge_NormalGrass"), 4);
  }

  /** Task_RunTimeBasedEvents / UpdateAmbientCry state machine. */
  Task_RunTimeBasedEvents(): void {
    const questLogState = (this.ow.game as unknown as { questLogState?: number }).questLogState;
    if (this.ow.controlsLocked || questLogState !== undefined
      && questLogState >= C.QL_STATE_PLAYBACK && questLogState <= C.QL_STATE_PLAYBACK_LAST) return;
    switch (this.ambientCryState) {
      case 0: this.ambientCryState = this.ambientCrySpecies === C.SPECIES_NONE ? 4 : 1; break;
      case 1: this.ambientCryDelay = random() % 2400 + 1200; this.ambientCryState = 3; break;
      case 2: this.ambientCryDelay = random() % 1200 + 1200; this.ambientCryState = 3; break;
      case 3:
        if (--this.ambientCryDelay === 0) {
          this.PlayAmbientCry();
          this.ambientCryState = 2;
        }
        break;
    }
  }

  /** PlayAmbientCry from overworld.c; WAV playback preserves the source pan/volume, with priority approximate. */
  PlayAmbientCry(): void {
    const p = this.ow.player.object;
    const [dx, dy] = DIRECTION_VECTORS[p.facingDirection];
    const behavior = this.ow.map.behaviorAt(p.currentCoords.x + dx, p.currentCoords.y + dy);
    if (this.ambientCryIsWaterMon && !MB.MetatileBehavior_IsSurfable(behavior)) return;
    const pan = (((random() % 88) + 212) << 24) >> 24;
    const volume = (random() % 30) + 50;
    if (this.ow.keepMusicOnNextLoad) return;
    sound.PlayCry_NormalNoDucking(this.ambientCrySpecies, pan, volume, C.CRY_PRIORITY_AMBIENT);
  }

  /** IcefallCaveIcePerStepCallback */
  IcefallCaveIcePerStepCallback(): void {
    const d = this.data;
    const p = this.ow.player.object;
    if (!p) return;
    const x = p.currentCoords.x, y = p.currentCoords.y;
    const map = this.ow.map;
    switch (d[1]) {
      case 0:
        d[2] = x; d[3] = y; d[1] = 1;
        break;
      case 1: {
        if (x === d[2] && y === d[3]) return;
        d[2] = x; d[3] = y;
        const behavior = map.behaviorAt(x, y);
        if (MB.MetatileBehavior_IsThinIce(behavior)) {
          this.MarkIcePuzzleCoordVisited(x, y);
          d[6] = 4; d[1] = 2; d[4] = x; d[5] = y;
        } else if (MB.MetatileBehavior_IsCrackedIce(behavior)) {
          d[6] = 4; d[1] = 3; d[4] = x; d[5] = y;
        }
        break;
      }
      case 2:
        if (d[6] !== 0) { d[6]--; break; }
        sound.playSE(C.SE_ICE_CRACK);
        map.setMetatileIdAt(d[4], d[5], rom.c("METATILE_SeafoamIslands_CrackedIce"));
        this.ow.renderer?.invalidate();
        d[1] = 1;
        break;
      case 3:
        if (d[6] !== 0) { d[6]--; break; }
        sound.playSE(C.SE_ICE_BREAK);
        map.setMetatileIdAt(d[4], d[5], rom.c("METATILE_SeafoamIslands_IceHole"));
        this.ow.renderer?.invalidate();
        varSet(C.VAR_TEMP_1, 1);
        d[1] = 1;
        break;
    }
  }

  /** MarkIcePuzzleCoordVisited. */
  MarkIcePuzzleCoordVisited(x: number, y: number): void {
    ICEFALL_ICE_COORDS.forEach(([ix, iy], i) => { if (ix + MAP_OFFSET === x && iy + MAP_OFFSET === y) flagSet(i + 1); });
  }

  /** SetIcefallCaveCrackedIceMetatiles. */
  SetIcefallCaveCrackedIceMetatiles(): void {
    ICEFALL_ICE_COORDS.forEach(([x, y], i) => {
      if (flagGet(i + 1)) this.ow.map.setMetatileIdAt(x + MAP_OFFSET, y + MAP_OFFSET, rom.c("METATILE_SeafoamIslands_CrackedIce"));
    });
    this.ow.renderer?.invalidate();
  }

  /** SetCrackedFloorHoleMetatile, retained for the unused RSE step callback. */
  SetCrackedFloorHoleMetatile(x: number, y: number): void {
    const id = this.ow.map.metatileIdAt(x, y);
    const cracked = rom.c("METATILE_RSCave_CrackedFloor");
    const hole = id === cracked ? rom.c("METATILE_RSCave_CrackedFloor_Hole") : rom.c("METATILE_Pacifidlog_SkyPillar_CrackedFloor_Hole");
    this.ow.map.setMetatileIdAt(x, y, hole);
    this.ow.renderer?.invalidate();
  }

  /** CrackedFloorPerStepCallback; not selected by any FireRed map script. */
  CrackedFloorPerStepCallback(): void {
    const d = this.data;
    const p = this.ow.player.object, x = p.currentCoords.x, y = p.currentCoords.y;
    const behavior = this.ow.map.behaviorAt(x, y);
    if (d[4] !== 0 && --d[4] === 0) this.SetCrackedFloorHoleMetatile(d[5], d[6]);
    if (d[7] !== 0 && --d[7] === 0) this.SetCrackedFloorHoleMetatile(d[8], d[9]);
    if (x === d[2] && y === d[3]) return;
    d[2] = x; d[3] = y;
    if (!MB.MetatileBehavior_IsCrackedFloor(behavior)) return;
    const fastestMach = !!(this.ow.player.flags & C.PLAYER_AVATAR_FLAG_MACH_BIKE) && this.ow.player.GetPlayerSpeed() === C.PLAYER_SPEED_FASTEST;
    if (!fastestMach) varSet(C.VAR_ICE_STEP_COUNT, 0);
    if (d[4] === 0) { d[4] = 3; d[5] = x; d[6] = y; }
    else if (d[7] === 0) { d[7] = 3; d[8] = x; d[9] = y; }
  }
}
