import type { Element } from "../types";
import { TILE } from "../constants";
import { DATA_ROOT } from "../../fr/rom";
import { facingFrame, fallbackGfx, gfxInfoOf, type Direction } from "./sprites";

export type LiveEntity = {
  element: Element;
  gx: number;
  gy: number;
  dir: Direction;
  el?: HTMLElement;
  defeated?: boolean;
};

export class EntityManager {
  readonly entities: LiveEntity[] = [];
  private container: HTMLElement | null = null;

  constructor(private readonly content: HTMLElement, private readonly minX: number, private readonly minY: number) {}

  addEntity(element: Element, gx: number, gy: number, dir: Direction): void {
    this.entities.push({ element, gx, gy, dir });
  }

  findAt(gx: number, gy: number): LiveEntity | undefined {
    return this.entities.find((e) => e.gx === gx && e.gy === gy);
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

      const inView = px >= viewLeft && px <= viewRight && py >= viewTop && py <= viewBottom;
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
