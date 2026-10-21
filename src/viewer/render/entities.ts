import * as C from "@game/generated/constants";
import type { ViewerObjectState } from "../objectState";
import type { Element } from "../types";
import { TILE } from "../constants";
import { DATA_ROOT, rom } from "@core/rom";
import { facingFrame, fallbackGfx, gfxInfoOf, spriteFolderOf, type Direction } from "./sprites";
import type { WorldGrid } from "../data/worldGrid";

let gfxTable: Map<number, string> | undefined;
function gfxNameById(id: number): string | undefined {
  if (rom.constants) return rom.nameOf("OBJ_EVENT_GFX_", id);
  if (!gfxTable) {
    gfxTable = new Map();
    for (const [k, v] of Object.entries(C)) {
      if (k.startsWith("OBJ_EVENT_GFX_") && typeof v === "number" && !gfxTable.has(v)) gfxTable.set(v, k);
    }
  }
  return gfxTable.get(id);
}

export type LiveEntity = {
  element: Element;
  gx: number;
  gy: number;
  dir: Direction;
  el?: HTMLElement;
  defeated?: boolean;
  hidden?: boolean;
  removed?: boolean;
  scriptInvisible?: boolean;
  engineState?: boolean;
  graphicsId?: number;
  elevation?: number;
  movementType?: number;
  initialGx: number; initialGy: number; initialDir: Direction;
  initialGraphics?: string; initialMovementType?: number;
  isStepping?: boolean;
  cooldownMs?: number;
};

export class EntityManager {
  readonly entities: LiveEntity[] = [];
  private container: HTMLElement | null = null;
  private presenceDirty = true;
  private vacatedTiles: {gx:number;gy:number}[] = [];

  constructor(private readonly content: HTMLElement, private readonly minX: number, private readonly minY: number) {}

  addEntity(element: Element, gx: number, gy: number, dir: Direction): void {
    this.entities.push({
      element, gx, gy, dir,
      initialGx: gx, initialGy: gy, initialDir: dir,
      initialGraphics: element.graphics, initialMovementType: element.movementType,
    });
    this.presenceDirty = true;
  }

  /** Remove an active instance, retaining its template until the next map load. */
  removeObject(mapId: string, localId: number): void {
    const ent = this.entities.find(e => e.element.map === mapId && e.element.localId === localId);
    if (ent) ent.removed = true;
  }

  resetRemovedObjects(): void {
    for (const ent of this.entities) {
      this.vacatedTiles.push({gx:ent.gx,gy:ent.gy});
      ent.removed=false;ent.scriptInvisible=false;ent.engineState=false;
      ent.gx=ent.initialGx;ent.gy=ent.initialGy;ent.dir=ent.initialDir;
      ent.graphicsId=undefined;ent.elevation=undefined;ent.movementType=undefined;
      ent.element.graphics=ent.initialGraphics;ent.element.movementType=ent.initialMovementType;
      ent.el?.remove();ent.el=undefined;
    }
    // Resident sector grids can predate a map reset even if every entity keeps
    // the same visibility. Rebuild their occupancy from the current state.
    this.presenceDirty = true;
  }

  takeVacatedTiles(): {gx:number;gy:number}[] { return this.vacatedTiles.splice(0); }

  applyObjectState(state: ViewerObjectState, element: Element, originX: number, originY: number): void {
    let ent=this.entities.find(e=>e.element.map===state.mapId&&e.element.localId===state.localId);
    if (!ent) {
      const initialDir:Direction=element.direction==='up'?'north':element.direction==='left'?'west':element.direction==='right'?'east':'south';
      this.addEntity(element,originX+element.x,originY+element.y,initialDir);
      ent=this.entities.at(-1)!;
    }
    const gx=originX+state.x,gy=originY+state.y;
    const nextGraphics = state.graphicsId !== undefined ? (gfxNameById(state.graphicsId) ?? ent.element.graphics) : ent.element.graphics;
    if (ent.gx!==gx||ent.gy!==gy||ent.dir!==state.direction||!!ent.scriptInvisible!==state.invisible||!!ent.removed!==state.removed||ent.element.graphics!==nextGraphics) {
      this.vacatedTiles.push({gx:ent.gx,gy:ent.gy});
      ent.el?.remove();ent.el=undefined;
      this.presenceDirty=true;
    }
    ent.gx=gx;ent.gy=gy;ent.dir=state.direction;ent.scriptInvisible=state.invisible;ent.removed=state.removed;ent.engineState=true;
    if (state.graphicsId !== undefined) { ent.graphicsId = state.graphicsId; ent.element.graphics = nextGraphics; }
    if (state.elevation !== undefined) ent.elevation = state.elevation;
    if (state.movementType !== undefined) { ent.movementType = state.movementType; ent.element.movementType = state.movementType; }
  }

  /** Retain hidden templates so clearing a flag can restore them without reloading. */
  syncPresence(isPresent: (element: Element) => boolean): boolean {
    let changed = this.presenceDirty;
    this.presenceDirty = false;
    for (const ent of this.entities) {
      const hidden = !!ent.removed || !isPresent(ent.element);
      if (hidden === !!ent.hidden) continue;
      ent.hidden = hidden;
      changed = true;
      if (hidden) { ent.el?.remove(); ent.el = undefined; }
    }
    return changed;
  }

  findAt(gx: number, gy: number): LiveEntity | undefined {
    return this.entities.find((e) => !e.hidden && e.gx === gx && e.gy === gy);
  }

  updateVisibility(
    viewLeft: number,
    viewTop: number,
    viewRight: number,
    viewBottom: number,
    onInteract: (ent: LiveEntity) => void
  ): void {
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "entities-container";
      this.container.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
      this.content.appendChild(this.container);
    }
    this.container.style.display = "block";

    for (const ent of this.entities) {
      const px = (ent.gx - this.minX) * TILE;
      const py = (ent.gy - this.minY) * TILE;

      const inView = !ent.hidden && !ent.scriptInvisible && px >= viewLeft && px <= viewRight && py >= viewTop && py <= viewBottom;
      if (!inView) {
        if (ent.el) {
          ent.el.remove();
          ent.el = undefined;
        }
        continue;
      }

      if (!ent.el) {
        const gfxKey = ent.element.graphics ?? "";
        const gfxInfo = gfxInfoOf(gfxKey) ?? fallbackGfx();
        const el = document.createElement("div");
        el.className = "world-npc";
        el.dataset.map = ent.element.map;
        if (ent.element.localId !== undefined) el.dataset.localId = String(ent.element.localId);
        el.style.width = `${gfxInfo.w}px`;
        el.style.height = `${gfxInfo.h}px`;
        el.style.left = `${px - (gfxInfo.w > 16 ? (gfxInfo.w - 16) / 2 : 0)}px`;
        el.style.top = `${py - (gfxInfo.h - 16)}px`;
        const folder = DATA_ROOT === "/hns" ? spriteFolderOf(gfxKey) : DATA_ROOT;
        el.style.backgroundImage = `url(${folder}/${gfxInfo.file})`;

        const { frame: frameIdx, flip } = facingFrame(gfxInfo, ent.dir);
        el.style.backgroundPosition = `-${frameIdx * gfxInfo.w}px 0px`;
        el.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onInteract(ent);
        });

        this.container.appendChild(el);
        ent.el = el;
      }
    }
  }

  hideAll(): void {
    if (this.container) {
      this.container.style.display = "none";
    }
  }

  dispose(): void {
    this.container?.remove();
    this.container = null;
    for (const entity of this.entities) entity.el = undefined;
  }

  faceTowards(ent: LiveEntity, targetGx: number, targetGy: number): void {
    const dx = targetGx - ent.gx;
    const dy = targetGy - ent.gy;
    if (Math.abs(dx) > Math.abs(dy)) {
      ent.dir = dx > 0 ? "east" : "west";
    } else {
      ent.dir = dy > 0 ? "south" : "north";
    }
    if (ent.el) {
      const gfxInfo = gfxInfoOf(ent.element.graphics ?? "") ?? fallbackGfx();
      const { frame, flip } = facingFrame(gfxInfo, ent.dir);
      ent.el.style.backgroundPosition = `-${frame * gfxInfo.w}px 0px`;
      ent.el.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";
    }
  }

  showAlert(ent: LiveEntity): void {
    if (ent.el && !ent.el.querySelector(".emoticon-balloon")) {
      const balloon = document.createElement("div");
      balloon.className = "emoticon-balloon";
      balloon.style.left = "0px";
      balloon.style.top = "-16px";
      ent.el.appendChild(balloon);
      setTimeout(() => balloon.remove(), 1200);
    }
  }

  updateAutonomousBehaviors(elapsedMs: number, playerGx: number, playerGy: number, grid?: WorldGrid): void {
    for (const ent of this.entities) {
      if (ent.hidden || ent.removed || !ent.el || ent.isStepping) continue;
      if (ent.element.trainer || ent.element.layer === "puerta" || ent.element.layer === "corte" || ent.element.layer === "snorlax") continue;

      let mType = ent.movementType ?? ent.element.movementType;
      if (mType === undefined) {
        const gfxKey = ent.element.graphics ?? "";
        const isStaticObj = gfxKey.includes("TRUCK") || gfxKey.includes("BALL") || gfxKey.includes("BERRY") || gfxKey.includes("ROCK") || gfxKey.includes("TREE") || gfxKey.includes("STATUE");
        if (!isStaticObj && (ent.element.layer === "npc" || ent.element.layer === "npc_condicional")) {
          mType = C.MOVEMENT_TYPE_WANDER_AROUND;
        } else {
          continue;
        }
      }
      if (mType === C.MOVEMENT_TYPE_NONE) continue;
      if ([C.MOVEMENT_TYPE_FACE_UP, C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_LEFT, C.MOVEMENT_TYPE_FACE_RIGHT].includes(mType)) continue;

      ent.cooldownMs = (ent.cooldownMs ?? (Math.random() * 2000 + 1000)) - elapsedMs;
      if (ent.cooldownMs > 0) continue;
      ent.cooldownMs = Math.random() * 2500 + 1500;

      const isWander = mType === C.MOVEMENT_TYPE_WANDER_AROUND || mType === C.MOVEMENT_TYPE_WANDER_AROUND_SLOWER
        || mType === C.MOVEMENT_TYPE_WANDER_UP_AND_DOWN || mType === C.MOVEMENT_TYPE_WANDER_DOWN_AND_UP
        || mType === C.MOVEMENT_TYPE_WANDER_LEFT_AND_RIGHT || mType === C.MOVEMENT_TYPE_WANDER_RIGHT_AND_LEFT;

      const isLook = mType === C.MOVEMENT_TYPE_LOOK_AROUND
        || mType === C.MOVEMENT_TYPE_FACE_DOWN_AND_UP || mType === C.MOVEMENT_TYPE_FACE_LEFT_AND_RIGHT
        || mType === C.MOVEMENT_TYPE_FACE_UP_AND_LEFT || mType === C.MOVEMENT_TYPE_FACE_UP_AND_RIGHT
        || mType === C.MOVEMENT_TYPE_FACE_DOWN_AND_LEFT || mType === C.MOVEMENT_TYPE_FACE_DOWN_AND_RIGHT;

      if (!isWander && !isLook) continue;

      let validDirs: Direction[] = ["south", "north", "west", "east"];
      if (mType === C.MOVEMENT_TYPE_WANDER_UP_AND_DOWN || mType === C.MOVEMENT_TYPE_WANDER_DOWN_AND_UP || mType === C.MOVEMENT_TYPE_FACE_DOWN_AND_UP) {
        validDirs = ["north", "south"];
      } else if (mType === C.MOVEMENT_TYPE_WANDER_LEFT_AND_RIGHT || mType === C.MOVEMENT_TYPE_WANDER_RIGHT_AND_LEFT || mType === C.MOVEMENT_TYPE_FACE_LEFT_AND_RIGHT) {
        validDirs = ["west", "east"];
      } else if (mType === C.MOVEMENT_TYPE_FACE_UP_AND_LEFT) {
        validDirs = ["north", "west"];
      } else if (mType === C.MOVEMENT_TYPE_FACE_UP_AND_RIGHT) {
        validDirs = ["north", "east"];
      } else if (mType === C.MOVEMENT_TYPE_FACE_DOWN_AND_LEFT) {
        validDirs = ["south", "west"];
      } else if (mType === C.MOVEMENT_TYPE_FACE_DOWN_AND_RIGHT) {
        validDirs = ["south", "east"];
      }

      const targetDir = validDirs[Math.floor(Math.random() * validDirs.length)]!;
      const gfxInfo = gfxInfoOf(ent.element.graphics ?? "") ?? fallbackGfx();

      if (!isWander || Math.random() < 0.35) {
        if (targetDir !== ent.dir) {
          ent.dir = targetDir;
          const { frame, flip } = facingFrame(gfxInfo, ent.dir);
          ent.el.style.backgroundPosition = `-${frame * gfxInfo.w}px 0px`;
          ent.el.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";
        }
        continue;
      }

      let nx = ent.gx;
      let ny = ent.gy;
      if (targetDir === "north") ny--;
      else if (targetDir === "south") ny++;
      else if (targetDir === "west") nx--;
      else if (targetDir === "east") nx++;

      const maxRangeX = ent.element.trainerRange || 2;
      const maxRangeY = ent.element.trainerRange || 2;
      if (Math.abs(nx - ent.initialGx) > maxRangeX || Math.abs(ny - ent.initialGy) > maxRangeY) {
        if (targetDir !== ent.dir) {
          ent.dir = targetDir;
          const { frame, flip } = facingFrame(gfxInfo, ent.dir);
          ent.el.style.backgroundPosition = `-${frame * gfxInfo.w}px 0px`;
          ent.el.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";
        }
        continue;
      }

      if (nx === playerGx && ny === playerGy) continue;
      if (grid && (!grid.isWalkable(nx, ny, "walk") || grid.isWaterTile(nx, ny))) {
        if (targetDir !== ent.dir) {
          ent.dir = targetDir;
          const { frame, flip } = facingFrame(gfxInfo, ent.dir);
          ent.el.style.backgroundPosition = `-${frame * gfxInfo.w}px 0px`;
          ent.el.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";
        }
        continue;
      }

      ent.isStepping = true;
      ent.dir = targetDir;
      if (grid) {
        grid.setNpc(ent.gx, ent.gy, false);
        grid.setNpc(nx, ny, true);
      }
      ent.gx = nx;
      ent.gy = ny;

      const px = (nx - this.minX) * TILE;
      const py = (ny - this.minY) * TILE;
      ent.el.style.transition = "left 0.28s linear, top 0.28s linear";
      ent.el.style.left = `${px - (gfxInfo.w > 16 ? (gfxInfo.w - 16) / 2 : 0)}px`;
      ent.el.style.top = `${py - (gfxInfo.h - 16)}px`;

      const { flip } = facingFrame(gfxInfo, ent.dir);
      ent.el.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";

      setTimeout(() => {
        ent.isStepping = false;
        if (ent.el) {
          ent.el.style.transition = "";
          const curFacing = facingFrame(gfxInfo, ent.dir);
          ent.el.style.backgroundPosition = `-${curFacing.frame * gfxInfo.w}px 0px`;
        }
      }, 290);
    }
  }
}
