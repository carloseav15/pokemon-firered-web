// A compact port of sprite.c: OAM sprites with frame animation commands,
// priorities, subpriorities and per-frame callbacks.

import type { AnimCmd } from "../rom";

const images = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  const ready = images.get(url);
  if (ready) return Promise.resolve(ready);
  let promise = pending.get(url);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { images.set(url, img); resolve(img); };
      img.onerror = () => reject(new Error(`failed to load ${url}`));
      img.src = url;
    });
    pending.set(url, promise);
  }
  return promise;
}

export function cachedImage(url: string): HTMLImageElement | undefined {
  return images.get(url);
}

/** One frame of a sprite sheet. */
export type FrameImage = { url: string; index: number; width: number; height: number };

export type SpriteCallback = (sprite: Sprite) => void;

export class Sprite {
  x = 0;
  y = 0;
  x2 = 0;
  y2 = 0;
  centerToCornerVecX = 0;
  centerToCornerVecY = 0;
  width = 16;
  height = 16;
  invisible = false;
  priority = 2;
  subpriority = 0;
  /** GBA subsprite table selector used by object-event elevation rendering. */
  subspriteTableNum = 0;
  /** GBA subsprite priority mode; retained for object movement types. */
  subspriteMode = 0;
  hFlip = false;
  vFlip = false;
  coordOffsetEnabled = true;
  /** When set, sprite is drawn into the BG0 window layer (above windows). */
  aboveWindows = false;
  anims: AnimCmd[][] = [];
  animNum = 0;
  animCmdIndex = 0;
  animDelayCounter = 0;
  animBeginning = true;
  animEnded = false;
  animPaused = false;
  animLoopCounter = 0;
  affineAnimPaused = false;
  /** OAM affine state used by object-event movement actions. */
  affineMode = 0;
  affineAnimNum = 0;
  affineScaleX = 1;
  affineScaleY = 1;
  affineRotation = 0;
  frameImages: FrameImage[] = [];
  imageValue = 0;
  data = new Array<number>(16).fill(0);
  callback: SpriteCallback | null = null;
  alpha = 1;
  /** Optional custom draw hook (field effects with generated canvases). */
  draw?: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  destroyed = false;
  scale = 1;

  startAnim(animNum: number): void {
    this.animNum = animNum;
    this.animBeginning = true;
    this.animEnded = false;
  }

  seekAnim(animCmdIndex: number): void {
    const paused = this.animPaused;
    this.animCmdIndex = animCmdIndex - 1;
    this.animDelayCounter = 0;
    this.animBeginning = false;
    this.animEnded = false;
    this.animPaused = false;
    this.continueAnim();
    if (this.animDelayCounter) this.animDelayCounter++;
    this.animPaused = paused;
  }

  private cmd(index = this.animCmdIndex): AnimCmd | undefined {
    return this.anims[this.animNum]?.[index];
  }

  private applyFrame(cmd: AnimCmd | undefined): void {
    if (!cmd || cmd[0] !== "F") return;
    let duration = cmd[2];
    if (duration) duration--;
    this.animDelayCounter = duration;
    this.hFlip = cmd[3] === 1;
    this.vFlip = cmd[4] === 1;
    this.imageValue = cmd[1];
  }

  /** AnimateSprite */
  animate(): void {
    if (this.anims.length === 0) return;
    if (this.animBeginning) this.beginAnim();
    else this.continueAnim();
  }

  private beginAnim(): void {
    this.animCmdIndex = 0;
    this.animEnded = false;
    this.animLoopCounter = 0;
    const cmd = this.cmd();
    if (cmd && cmd[0] === "F") {
      this.animBeginning = false;
      this.applyFrame(cmd);
    }
  }

  private continueAnim(): void {
    if (this.animDelayCounter) {
      if (!this.animPaused) this.animDelayCounter--;
      const cmd = this.cmd();
      if (cmd && cmd[0] === "F") { this.hFlip = cmd[3] === 1; this.vFlip = cmd[4] === 1; }
    } else if (!this.animPaused) {
      this.animCmdIndex++;
      const cmd = this.cmd();
      if (!cmd) { this.animCmdIndex--; this.animEnded = true; return; }
      switch (cmd[0]) {
        case "F": this.applyFrame(cmd); break;
        case "E": this.animCmdIndex--; this.animEnded = true; break;
        case "J": this.animCmdIndex = cmd[1]; this.applyFrame(this.cmd()); break;
        case "L":
          if (this.animLoopCounter) this.animLoopCounter--;
          else this.animLoopCounter = cmd[1];
          if (this.animLoopCounter) {
            this.animCmdIndex--;
            while (this.animCmdIndex > 0 && this.cmd(this.animCmdIndex - 1)?.[0] !== "L") this.animCmdIndex--;
            this.animCmdIndex--;
          }
          this.continueAnim();
          break;
      }
    }
  }

  frame(): FrameImage | undefined {
    return this.frameImages[this.imageValue] ?? this.frameImages[0];
  }
}

export class SpriteManager {
  readonly sprites: Sprite[] = [];
  /** Stable GBA OAM slot IDs, independent of the render-list indices. */
  private readonly spriteIds: Array<Sprite | undefined> = new Array(64);
  /** gSpriteCoordOffsetX/Y */
  offsetX = 0;
  offsetY = 0;
  /** Canvas filter for all sprites (field weather dimming); null for none. */
  filter: string | null = null;

  add(sprite: Sprite): Sprite {
    return this.addIntoFreeSlot(sprite, false);
  }

  /** CreateSpriteAtEnd uses the highest free OAM slot first. */
  addAtEnd(sprite: Sprite): Sprite {
    return this.addIntoFreeSlot(sprite, true);
  }

  private addIntoFreeSlot(sprite: Sprite, fromEnd: boolean): Sprite {
    if (!this.sprites.includes(sprite)) this.sprites.push(sprite);
    if (this.getId(sprite) === 0xff) {
      let slot = -1;
      if (fromEnd) {
        for (let i = this.spriteIds.length - 1; i >= 0; i--) {
          if (!this.spriteIds[i] || this.spriteIds[i]!.destroyed) { slot = i; break; }
        }
      } else {
        slot = this.spriteIds.findIndex((entry) => !entry || entry.destroyed);
      }
      if (slot >= 0) this.spriteIds[slot] = sprite;
    }
    return sprite;
  }

  /** CreateSprite/CreateSpriteAtEnd result; 0xFF is MAX_SPRITES. */
  getId(sprite: Sprite): number {
    const id = this.spriteIds.indexOf(sprite);
    return id < 0 || sprite.destroyed ? 0xff : id;
  }

  getById(id: number): Sprite | undefined {
    const sprite = this.spriteIds[id & 0xff];
    return sprite && !sprite.destroyed ? sprite : undefined;
  }

  destroy(sprite: Sprite | undefined): void {
    if (!sprite) return;
    sprite.destroyed = true;
    const id = this.spriteIds.indexOf(sprite);
    if (id >= 0) this.spriteIds[id] = undefined;
    const index = this.sprites.indexOf(sprite);
    if (index >= 0) this.sprites.splice(index, 1);
  }

  clear(): void {
    for (const s of this.sprites) s.destroyed = true;
    this.sprites.length = 0;
    this.spriteIds.fill(undefined);
  }

  /** RunSpriteCallbacks + AnimateSprites */
  update(): void {
    for (const sprite of [...this.sprites]) {
      if (sprite.destroyed) continue;
      sprite.callback?.(sprite);
      if (!sprite.destroyed) sprite.animate();
    }
  }

  /** Draw every sprite with the given priority (higher subpriority value = further back). */
  render(ctx: CanvasRenderingContext2D, priority: number, aboveWindows = false): void {
    const list = this.sprites
      .filter((s) => !s.invisible && s.priority === priority && s.aboveWindows === aboveWindows)
      .sort((a, b) => b.subpriority - a.subpriority);
    for (const sprite of list) this.drawSprite(ctx, sprite);
  }

  drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite): void {
    let x = sprite.x + sprite.x2 + sprite.centerToCornerVecX;
    let y = sprite.y + sprite.y2 + sprite.centerToCornerVecY;
    // DOUBLE expands the OAM bounds around the same center. With the identity
    // matrix, the rendered pixels retain their normal anchor position.
    if (sprite.affineMode & 2) {
      x += sprite.width >> 1;
      y += sprite.height >> 1;
    }
    if (sprite.coordOffsetEnabled) {
      x += this.offsetX;
      y += this.offsetY;
    }
    if (x > 240 || y > 160 || x + sprite.width * sprite.scale < -64 || y + sprite.height * sprite.scale < -64) return;
    if (sprite.draw) {
      sprite.draw(ctx, Math.round(x), Math.round(y));
      return;
    }
    const frame = sprite.frame();
    if (!frame) return;
    const img = cachedImage(frame.url);
    if (!img) {
      void loadImage(frame.url);
      return;
    }
    const perRow = Math.max(1, Math.floor(img.width / frame.width));
    const sx = (frame.index % perRow) * frame.width;
    const sy = Math.floor(frame.index / perRow) * frame.height;
    ctx.save();
    if (sprite.alpha !== 1) ctx.globalAlpha = sprite.alpha;
    if (this.filter !== null) ctx.filter = this.filter;
    const w = frame.width * sprite.scale * sprite.affineScaleX;
    const h = frame.height * sprite.scale * sprite.affineScaleY;
    const dx = Math.round(x + (frame.width * sprite.scale - w) / 2);
    const dy = Math.round(y + (frame.height * sprite.scale - h) / 2);
    if (sprite.affineRotation) {
      ctx.translate(dx + w / 2, dy + h / 2);
      ctx.rotate(sprite.affineRotation * Math.PI / 128);
      ctx.translate(-w / 2, -h / 2);
    }
    if (sprite.hFlip || sprite.vFlip) {
      ctx.translate(dx + (sprite.hFlip ? w : 0), dy + (sprite.vFlip ? h : 0));
      ctx.scale(sprite.hFlip ? -1 : 1, sprite.vFlip ? -1 : 1);
      ctx.drawImage(img, sx, sy, frame.width, frame.height, 0, 0, w, h);
    } else {
      ctx.drawImage(img, sx, sy, frame.width, frame.height, dx, dy, w, h);
    }
    ctx.restore();
  }
}
