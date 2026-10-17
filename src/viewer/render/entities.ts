import * as C from "@game/generated/constants";
import type { ViewerObjectState } from "../objectState";
import type { Element } from "../types";
import { TILE } from "../constants";
import { DATA_ROOT, rom } from "@core/rom";
import { facingFrame, fallbackGfx, gfxInfoOf, type Direction } from "./sprites";

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
        el.style.backgroundImage = `url(${DATA_ROOT}/${gfxInfo.file})`;

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

  updateAutonomousBehaviors(now: number, playerGx: number, playerGy: number): void {
    // Los NPCs con movimiento miran ocasionalmente a los lados o dan un pequeño paso
    // sin abandonar su área ni superponerse con el jugador
    for (const ent of this.entities) {
      if (ent.element.movementType !== undefined && [C.MOVEMENT_TYPE_FACE_UP,C.MOVEMENT_TYPE_FACE_DOWN,C.MOVEMENT_TYPE_FACE_LEFT,C.MOVEMENT_TYPE_FACE_RIGHT].includes(ent.element.movementType)) continue;
      if (!ent.el || ent.element.trainer || ent.element.layer === "puerta") continue;
      // Probabilidad baja por tick para emular los descansos de GBA
      if (Math.random() < 0.003) {
        const dirs: Direction[] = ["south", "north", "west", "east"];
        const nextDir = dirs[Math.floor(Math.random() * dirs.length)]!;
        if (nextDir !== ent.dir) {
          ent.dir = nextDir;
          const gfxInfo = gfxInfoOf(ent.element.graphics ?? "") ?? fallbackGfx();
          const { frame, flip } = facingFrame(gfxInfo, ent.dir);
          ent.el.style.backgroundPosition = `-${frame * gfxInfo.w}px 0px`;
          ent.el.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";
        }
      }
    }
  }
}
