import { Sprite, loadImage } from "@core/gba/sprite";
import type { AnimCmd, ObjectGfxInfo } from "@core/rom";
import { cdata, symName } from "@core/hw/assets";
import { GetMoveDirectionAnimNum, GetMoveDirectionFastAnimNum, GetRunningDirectionAnimNum, GetJumpSpecialDirectionAnimNum } from "../../games/firered/generated/eventObjectAnims";
import * as C from "../../games/firered/generated/constants";
import type { Direction } from "./sprites";
import type { PlayerVehicle } from "../state";

export type AvatarAction = "walk" | "run" | "bike" | "surf" | "jump" | "bump" | "turn" | "board" | "dismount";
export type AvatarData = { gfx: Record<string, ObjectGfxInfo>; animTables: Record<string, Array<string | null>>; anims: Record<string, AnimCmd[]> };
const directions = { south: C.DIR_SOUTH, north: C.DIR_NORTH, west: C.DIR_WEST, east: C.DIR_EAST };

/** Source frame indirection + the shared sprite.c interpreter. No viewer-specific frame numbering. */
export class AvatarAnimator {
  private readonly sprite = new Sprite();
  private gfx!: ObjectGfxInfo;
  private key = "";
  private lastTick = 0;
  private moving = false;
  private beganTick = 0;
  private action: AvatarAction = "walk";
  private char: "red" | "leaf" = "red";
  private vehicle: PlayerVehicle = "walk";
  private direction: Direction = "south";
  constructor(private readonly data: AvatarData) {}

  async preload(): Promise<void> {
    const urls = new Set<string>();
    for (const id of [C.OBJ_EVENT_GFX_RED_NORMAL, C.OBJ_EVENT_GFX_RED_BIKE, C.OBJ_EVENT_GFX_RED_SURF,
      C.OBJ_EVENT_GFX_GREEN_NORMAL, C.OBJ_EVENT_GFX_GREEN_BIKE, C.OBJ_EVENT_GFX_GREEN_SURF]) {
      const gfx = this.data.gfx[String(id)];
      if (!gfx) throw new Error(`Missing avatar graphics ${id}`);
      const anims = this.data.animTables[gfx.anims];
      if (!anims) throw new Error(`Missing avatar animation table ${gfx.anims}`);
      for (const [file] of gfx.frames) urls.add(`/fr/${file}`);
    }
    await Promise.all([...urls].map(async url => { const image = await loadImage(url); await image.decode(); }));
    for (const gfx of Object.values(this.data.gfx).filter(gfx => /OBJ_EVENT_GFX_(RED|GREEN)_(NORMAL|BIKE|SURF)$/.test(gfx.name))) {
      for (const [file, index] of gfx.frames) {
        const image = await loadImage(`/fr/${file}`);
        if (image.naturalHeight !== gfx.height || !Number.isInteger(image.naturalWidth / gfx.width) || index >= image.naturalWidth / gfx.width)
          throw new Error(`Unsupported avatar sheet packing ${file}/${index}`);
      }
    }
  }
  private configure(char: "red" | "leaf", vehicle: PlayerVehicle): boolean {
    const key = `${char}/${vehicle}`;
    if (this.key === key) return false;
    this.key = key;
    const id = char === "red" ? vehicle === "bike" ? C.OBJ_EVENT_GFX_RED_BIKE : vehicle === "surf" ? C.OBJ_EVENT_GFX_RED_SURF : C.OBJ_EVENT_GFX_RED_NORMAL
      : vehicle === "bike" ? C.OBJ_EVENT_GFX_GREEN_BIKE : vehicle === "surf" ? C.OBJ_EVENT_GFX_GREEN_SURF : C.OBJ_EVENT_GFX_GREEN_NORMAL;
    this.gfx = this.data.gfx[String(id)]!;
    this.sprite.anims = this.data.animTables[this.gfx.anims]!.map(name => name ? this.data.anims[name]! : []);
    this.sprite.animCmdIndex = 0;
    this.sprite.animDelayCounter = 0;
    return true;
  }
  private positions(): number[] {
    const entry = cdata<{ anims: unknown; animPos: number[] }[]>("event_object_movement", "sStepAnimTables")
      .find(entry => symName(entry.anims) === this.gfx.anims);
    if (!entry) throw new Error(`Missing step alternation for ${this.gfx.anims}`);
    return entry.animPos;
  }
  begin(char: "red" | "leaf", vehicle: PlayerVehicle, direction: Direction, action: AvatarAction, tick: number): void {
    this.advance(tick);
    this.char = char; this.vehicle = vehicle; this.direction = direction; this.action = action;
    this.configure(char, action === "board" || action === "dismount" ? "surf" : vehicle);
    const dir = directions[direction];
    this.sprite.animNum = action === "run" ? GetRunningDirectionAnimNum(dir)
      : action === "board" || action === "dismount" ? GetJumpSpecialDirectionAnimNum(dir)
      : action === "bike" || action === "surf" || action === "turn" ? GetMoveDirectionFastAnimNum(dir) : GetMoveDirectionAnimNum(dir);
    const commands = this.sprite.anims[this.sprite.animNum];
    if (!commands?.length) throw new Error(`Missing selected avatar animation ${this.gfx.anims}/${this.sprite.animNum}`);
    for (const cmd of commands) if (cmd[0] === "F" && !this.gfx.frames[cmd[1]]) throw new Error(`Avatar frame out of bounds: ${cmd[1]}`);
    const pos = this.positions();
    let index = this.sprite.animCmdIndex;
    if (action === "board" || action === "dismount") index = 0;
    else if (index === pos[0]) index = pos[3]!;
    else if (index === pos[1]) index = pos[2]!;
    this.sprite.seekAnim(index);
    this.sprite.animPaused = false;
    this.moving = true;
    this.lastTick = tick;
    this.beganTick = tick;
  }
  stop(char: "red" | "leaf", vehicle: PlayerVehicle, direction: Direction, tick: number): void {
    this.advance(tick);
    this.moving = false;
    this.char = char; this.vehicle = vehicle; this.direction = direction;
    this.configure(char, vehicle);
    this.sprite.animNum = GetMoveDirectionAnimNum(directions[direction]);
    const pos = this.positions();
    this.sprite.seekAnim(this.sprite.animCmdIndex <= pos[0]! ? pos[0]! : pos[1]!);
    this.sprite.animPaused = true;
    this.lastTick = tick;
  }
  private advance(tick: number): void {
    if (!this.moving) { this.lastTick = tick; return; }
    while (this.lastTick < tick) {
      this.lastTick++;
      // WalkInPlaceSlow adds one delay on odd remaining-duration ticks; equivalently,
      // AnimateSprite advances only on the first/third/... tick of this 32-tick action.
      if (this.action !== "bump" || this.vehicle === "bike" || (this.lastTick - this.beganTick) % 2 === 1) this.sprite.animate();
    }
  }
  frame(char: "red" | "leaf", vehicle: PlayerVehicle, direction: Direction, tick: number) {
    if (!this.key || !this.moving && (char !== this.char || vehicle !== this.vehicle || direction !== this.direction)) this.stop(char, vehicle, direction, tick);
    this.advance(tick);
    const [file, index] = this.gfx.frames[this.sprite.imageValue]!;
    return { url: `/fr/${file}`, index, width: this.gfx.width, height: this.gfx.height, hFlip: this.sprite.hFlip, vFlip: this.sprite.vFlip,
      shadowSize: this.gfx.shadowSize, image: this.sprite.imageValue, command: this.sprite.animCmdIndex, delay: this.sprite.animDelayCounter, animation: this.sprite.animNum, action: this.action, direction: this.direction, graphics: this.gfx.name, moving: this.moving };
  }
  /** NpcTakeStep tables, not macOS timing or a guessed ms duration. */
  offsets(action: AvatarAction): number[] {
    const table = action === "bike" ? "sSpeedFast2StepFuncs" : action === "run" || action === "surf" ? "sSpeedFast1StepFuncs" : "sSpeedNormalStepFuncs";
    let x = 0;
    return cdata<unknown[]>("event_object_movement", table).map(ref => {
      const name = symName(ref), amount = name && /^Step([1-8])$/.exec(name)?.[1];
      if (!amount) throw new Error(`Unsupported avatar speed entry ${name}`);
      return x += Number(amount);
    });
  }
}
