// field_tasks.c Task_RunPerStepCallback: the per-step callback a map script
// selects with setstepcallback. FireRed uses STEP_CB_ICE (Icefall Cave).

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { sound } from "../audio/sound";
import { rom } from "../rom";
import { flagSet, varSet } from "../save";
import { MAP_OFFSET } from "./fieldmap";
import type { Overworld } from "./overworld";

const ICEFALL_ICE_COORDS = [[8, 3], [10, 5], [15, 5], [8, 9], [9, 9], [16, 9], [8, 10], [9, 10], [8, 14]];

export class PerStepCallback {
  private id = C.STEP_CB_DUMMY;
  private data = new Array<number>(16).fill(0);

  constructor(private readonly ow: Overworld) {
    ow.onFrame.push(() => this.run());
  }

  /** ActivatePerStepCallback */
  activate(id: number): void {
    this.data.fill(0);
    this.id = id;
  }

  /** New maps start with the dummy callback until their scripts pick one. */
  reset(): void { this.activate(C.STEP_CB_DUMMY); }

  private run(): void {
    if (this.id === C.STEP_CB_ICE) this.icefallCaveIce();
  }

  /** IcefallCaveIcePerStepCallback */
  private icefallCaveIce(): void {
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
          ICEFALL_ICE_COORDS.forEach(([ix, iy], i) => { if (ix + MAP_OFFSET === x && iy + MAP_OFFSET === y) flagSet(i + 1); });
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
}
