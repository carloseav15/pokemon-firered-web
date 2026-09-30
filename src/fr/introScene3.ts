// intro.c: IntroCB_Scene3_Entrance, IntroCB_Scene3_Fight and their sprite callbacks.
import { sound } from "./audio/sound";
import { SPECIES_NIDORINO, CRY_MODE_DOUBLES } from "./generated/constants";
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import {
  BG_COORD_ADD, BG_COORD_SET, BG_COORD_SUB, type BgTemplate,
  ChangeBgX, ChangeBgY, GetBgX, HideBg, InitBgsFromTemplates,
  LoadBgTilemap, LoadBgTiles, ShowBg,
} from "./hw/bg";
import {
  ClearGpuRegBits, CopyBufferedValuesToGpuRegs, SetGpuReg,
  SetGpuRegBits,
} from "./hw/gpu";
import {
  BeginNormalPaletteFade, BlendPalettes, FillPalette, gPaletteFade,
  gPlttBufferUnfaded, LoadPalette, PALETTES_ALL, RGB_BLACK,
  RGB_WHITE, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  DISPCNT_WIN0_ON, ppu, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H,
  REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  WININ_WIN0_BG0, WININ_WIN0_BG1, WININ_WIN0_OBJ, WIN_RANGE,
} from "./hw/ppu";
import {
  AFFINEANIMCMD_END, AFFINEANIMCMD_FRAME, ANIMCMD_END, ANIMCMD_FRAME,
  ANIMCMD_JUMP, AnimateSprites, BuildOamBuffer, CalcCenterToCornerVec,
  CreateSprite, DestroySprite, gDummySpriteAffineAnimTable, gSprites,
  LoadOam, LoadSpritePalette, LoadSpriteSheet, MAX_SPRITES, oamData,
  ResetSpriteData, SetSpriteMatrixAnchor, SPRITE_SHAPE, SPRITE_SIZE,
  SpriteCallbackDummy, StartSpriteAffineAnim, StartSpriteAnim,
  type AffineAnimCmd, type AnimCmd, type OamData, type Sprite,
  type SpriteTemplate,
} from "./hw/sprite";
import { gSineTable } from "./hw/trig";

const symbols = [
  "sScene3_Bg_Pal", "sScene3_Bg_Gfx", "sScene3_Bg_Map",
  "sScene3_GengarAnim_Gfx", "sScene3_GengarAnim_Map", "sGengar_Pal",
  "sScene3_Nidorino_Gfx", "sNidorino_Pal", "sScene3_Grass_Gfx",
  "sScene3_Grass_Pal", "sScene3_GengarStatic_Gfx",
  "sScene3_Swipe_Gfx", "sScene3_Swipe_Pal",
  "sScene3_RecoilDust_Gfx", "sScene3_RecoilDust_Pal",
];
type SymRef = { $sym: string };
type ExtractedAnim = { frame?: { imageValue: number; duration: number }; jump?: { target: number }; type?: number };
type ExtractedAffineAnim = { frame?: { xScale: number; yScale: number; rotation: number; duration: number }; type?: number };
type ExtractedTemplate = { tileTag: number; paletteTag: number };

function animations(name: string): AnimCmd[][] {
  return cdata<SymRef[]>("intro", name).map(({ $sym }) =>
    cdata<ExtractedAnim[]>("intro", $sym).map((cmd) =>
      cmd.frame ? ANIMCMD_FRAME(cmd.frame.imageValue, cmd.frame.duration) :
        cmd.jump ? ANIMCMD_JUMP(cmd.jump.target) : ANIMCMD_END));
}

function affineAnimations(name: string): AffineAnimCmd[][] {
  return cdata<SymRef[]>("intro", name).map(({ $sym }) =>
    cdata<ExtractedAffineAnim[]>("intro", $sym).map((cmd) =>
      cmd.frame ? AFFINEANIMCMD_FRAME(cmd.frame.xScale, cmd.frame.yScale, cmd.frame.rotation, cmd.frame.duration) : AFFINEANIMCMD_END));
}

function spriteTemplate(name: string, oamName: string, animName: string, callback: (sprite: Sprite) => void, affine = false): SpriteTemplate {
  const def = cdata<ExtractedTemplate>("intro", name);
  return {
    tileTag: def.tileTag,
    paletteTag: def.paletteTag,
    oam: oamData(cdata<OamData>("intro", oamName)),
    anims: animations(animName),
    images: null,
    affineAnims: affine ? affineAnimations("sAffineAnims_Scene3_Mons") : gDummySpriteAffineAnimTable,
    callback,
  };
}

/** intro.c entrance and background-task callbacks, dispatched by the startup loop. */
export function IntroCB_Scene3_Entrance(scene: IntroScene3): void { scene.updateEntrance(); }
export function Scene3_Task_BgScroll(scene: IntroScene3): void { scene.taskBgScroll(); }
export function Scene3_StartBgScroll(scene: IntroScene3): void { scene.startBgScroll(); }
export function Scene3_SlowBgScroll(scene: IntroScene3): void { scene.slowBgScroll(); }
export function Scene3_Task_GengarBounce(scene: IntroScene3): void { scene.taskGengarBounce(); }
export function Scene3_PauseGengarBounce(scene: IntroScene3): void { scene.pauseGengarBounce(); }
export function Scene3_ResumeGengarBounce(scene: IntroScene3): void { scene.resumeGengarBounce(); }
export function Scene3_IsGengarMidBounce(scene: IntroScene3): number { return scene.isGengarMidBounce(); }
/** C-name adapters for Nidorino's cry, recoil, hop, and attack callbacks. */
export function Scene3_StartNidorinoCry(scene: IntroScene3, sprite: Sprite): void { scene.startNidorinoCry(sprite); }
export function SpriteCB_NidorinoCry(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackNidorinoCry(sprite); }
export function Scene3_StartNidorinoRecoil(scene: IntroScene3, sprite: Sprite): void { scene.startNidorinoRecoil(sprite); }
export function SpriteCB_NidorinoRecoil(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackNidorinoRecoil(sprite); }
export function Scene3_NidorinoAnimIsRunning(_scene: IntroScene3, sprite: Sprite): boolean { return sprite.callback !== SpriteCallbackDummy; }
export function CreateNidorinoRecoilDustSprites(scene: IntroScene3, x: number, y: number, seed: number): void { scene.createRecoilDust(x, y, seed); }
export function SpriteCB_RecoilDust(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackRecoilDust(sprite); }
export function Scene3_StartNidorinoHop(scene: IntroScene3, sprite: Sprite, time: number, targetX: number, heightShift: number): void { scene.startNidorinoHop(sprite, time, targetX, heightShift); }
export function SpriteCB_NidorinoHop(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackNidorinoHop(sprite); }
export function Scene3_StartNidorinoAttack(scene: IntroScene3, sprite: Sprite): void { scene.startNidorinoAttack(sprite); }
export function SpriteCB_NidorinoAttack(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackNidorinoAttack(sprite); }
/** intro.c Gengar attack callback and task/sprite helper family. */
export function IntroCB_Scene3_Fight(scene: IntroScene3): void { scene.updateFight(); }
export function Scene3_StartGengarAttack(scene: IntroScene3): void { scene.startGengarAttack(); }
export function Scene3_ApplyGengarAnim(scene: IntroScene3, frame: number, xSub: number, ySub: number, xBase: number): void {
  scene.applyGengarAnim(frame, xSub, ySub, xBase);
}
export function Scene3_Task_GengarAttack(scene: IntroScene3): void { scene.taskGengarAttack(); }
export function Scene3_CreateGengarSwipeSprites(scene: IntroScene3): void { scene.createGengarSwipeSprites(); }
export function SpriteCB_GengarSwipe(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackGengarSwipe(sprite); }
/** intro.c Nidorino/Gengar entrance and foreground grass callbacks. */
export function Scene3_CreateNidorinoSprite(scene: IntroScene3): void { scene.createNidorinoSprite(); }
export function Scene3_StartNidorinoEntrance(scene: IntroScene3, sprite: Sprite, xStart: number, xEnd: number, time: number): void {
  scene.startNidorinoEntrance(sprite, xStart, xEnd, time);
}
export function Scene3_SpriteCB_NidorinoEnter(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackNidorinoEnter(sprite); }
export function Scene3_IsNidorinoEntering(scene: IntroScene3): boolean { return scene.isNidorinoEntering(); }
export function Scene3_Task_GengarEnter(scene: IntroScene3): void { scene.taskGengarEnter(); }
export function Scene3_CreateGrassSprite(scene: IntroScene3): void { scene.createGrassSprite(); }
export function SpriteCB_Grass(scene: IntroScene3, sprite: Sprite): void { scene.spriteCallbackGrass(sprite); }

export class IntroScene3 {
  private phase: "entrance" | "fight" | "exit" = "entrance";
  private state = 0;
  private timer = 0;
  private bounceTimer = 0;
  private bounceFrame = 0;
  private bouncePaused = false;
  private bounceTaskActive = false;
  private gengarSpeed = 0x400;
  private gengarMoves = 0;
  private gengarEnterTaskActive = false;
  private scrollSlow = false;
  private bgScrollTaskActive = false;
  private nidorinoSprite = MAX_SPRITES;
  private grassSprite = MAX_SPRITES;
  private readonly gengarSprites: number[] = [];
  private attackState = -1;
  private attackTimer = 0;
  private attackSin = 64;
  private attackFrame = 0;
  private attackMultX = 0;
  private attackMultY = 0;
  private attackBaseX = 0;
  private attackLanded = false;
  done = false;

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(symbols), loadCData("intro")]);
  }

  begin(): void {
    this.phase = "entrance";
    this.state = this.timer = this.bounceTimer = this.bounceFrame = 0;
    this.gengarSpeed = 0x400;
    this.gengarMoves = 0;
    this.gengarEnterTaskActive = false;
    this.scrollSlow = false;
    this.bouncePaused = false;
    this.bounceTaskActive = false;
    this.bgScrollTaskActive = false;
    this.nidorinoSprite = MAX_SPRITES;
    this.nidorinoEntering = false;
    this.grassSprite = MAX_SPRITES;
    this.gengarSprites.length = 0;
    this.attackState = -1;
    this.attackLanded = false;
    this.done = false;
    ResetSpriteData();
    LoadSpriteSheet({ data: incbin("sScene3_Nidorino_Gfx"), size: 0x2800, tag: 5 });
    LoadSpriteSheet({ data: incbin("sScene3_Grass_Gfx"), size: 0x800, tag: 8 });
    LoadSpriteSheet({ data: incbin("sScene3_GengarStatic_Gfx"), size: 0x1800, tag: 9 });
    LoadSpriteSheet({ data: incbin("sScene3_Swipe_Gfx"), size: 0xa00, tag: 10 });
    LoadSpriteSheet({ data: incbin("sScene3_RecoilDust_Gfx"), size: 0x200, tag: 11 });
    LoadSpritePalette({ data: incbin("sGengar_Pal"), tag: 6 });
    LoadSpritePalette({ data: incbin("sNidorino_Pal"), tag: 7 });
    LoadSpritePalette({ data: incbin("sScene3_Grass_Pal"), tag: 8 });
    LoadSpritePalette({ data: incbin("sScene3_Swipe_Pal"), tag: 10 });
    LoadSpritePalette({ data: incbin("sScene3_RecoilDust_Pal"), tag: 11 });
  }

  update(): void {
    if (this.done) return;
    if (this.phase !== "exit" && (this.phase === "fight" || this.state >= 3)) this.runSceneTasks();
    if (this.phase === "fight") IntroCB_Scene3_Fight(this);
    else if (this.phase === "exit") this.updateExit();
    else IntroCB_Scene3_Entrance(this);
    AnimateSprites();
    BuildOamBuffer();
    LoadOam();
    UpdatePaletteFade();
    CopyBufferedValuesToGpuRegs();
    TransferPlttBuffer();
  }

  updateEntrance(): void {
    switch (this.state) {
      case 0:
        LoadPalette(incbin("sScene3_Bg_Pal"), 16, incbin("sScene3_Bg_Pal").length);
        LoadPalette(incbin("sGengar_Pal"), 5 * 16, 32);
        BlendPalettes(PALETTES_ALL & ~1, 16, RGB_WHITE);
        InitBgsFromTemplates(0, cdata<BgTemplate[]>("intro", "sBgTemplates_Scene3"));
        LoadBgTiles(1, incbin("sScene3_Bg_Gfx"), incbin("sScene3_Bg_Gfx").length, 0);
        LoadBgTilemap(1, incbin("sScene3_Bg_Map"), incbin("sScene3_Bg_Map").length, 0);
        ShowBg(1);
        HideBg(0);
        HideBg(2);
        HideBg(3);
        for (let bg = 0; bg < 4; bg++) {
          ChangeBgX(bg, 0, BG_COORD_SET);
          ChangeBgY(bg, 0, BG_COORD_SET);
        }
        SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
        SetGpuRegBits(REG_OFFSET_WININ, WININ_WIN0_BG1 | WININ_WIN0_OBJ);
        ClearGpuRegBits(REG_OFFSET_WININ, WININ_WIN0_BG0);
        SetGpuRegBits(REG_OFFSET_WINOUT, 0);
        SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(32, 128));
        SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 120));
        this.state++;
        break;
      case 1:
        LoadBgTiles(0, incbin("sScene3_GengarAnim_Gfx"), incbin("sScene3_GengarAnim_Gfx").length, 0);
        LoadBgTilemap(0, incbin("sScene3_GengarAnim_Map"), incbin("sScene3_GengarAnim_Map").length, 0);
        ChangeBgX(0, 0x1800, BG_COORD_SET);
        ChangeBgY(0, 0x1f000, BG_COORD_SET);
        this.state++;
        break;
      case 2:
        BlendPalettes(PALETTES_ALL & ~1, 0, RGB_WHITE);
        ShowBg(0);
        Scene3_CreateNidorinoSprite(this);
        if (this.nidorinoSprite !== MAX_SPRITES) {
          Scene3_StartNidorinoEntrance(this, gSprites[this.nidorinoSprite], 0, 180, 52);
        }
        this.gengarEnterTaskActive = true;
        this.bounceTaskActive = true;
        Scene3_StartBgScroll(this);
        this.timer = 0;
        this.state++;
        break;
      case 3:
        if (++this.timer === 16) Scene3_CreateGrassSprite(this);
        if (!Scene3_IsNidorinoEntering(this) && !this.gengarEnterTaskActive) {
          this.phase = "fight";
          this.state = 0;
        }
        break;
    }
  }

  private runSceneTasks(): void {
    if (this.bgScrollTaskActive) Scene3_Task_BgScroll(this);
    if (this.bounceTaskActive) Scene3_Task_GengarBounce(this);
    if (this.gengarEnterTaskActive) Scene3_Task_GengarEnter(this);
    if (this.attackState >= 0) Scene3_Task_GengarAttack(this);
  }

  taskBgScroll(): void {
    ChangeBgX(1, this.scrollSlow ? 0x20 : 0x400, BG_COORD_SUB);
  }

  startBgScroll(): void {
    this.bgScrollTaskActive = true;
  }

  slowBgScroll(): void {
    this.scrollSlow = true;
  }

  taskGengarBounce(): void {
    if (!this.bouncePaused && ++this.bounceTimer >= 30) {
      this.bounceTimer = 0;
      this.bounceFrame ^= 1;
      ChangeBgY(0, (this.bounceFrame << 15) + 0x1f000, BG_COORD_SET);
    }
  }

  pauseGengarBounce(): void { this.bouncePaused = true; }
  resumeGengarBounce(): void { this.bouncePaused = false; }
  isGengarMidBounce(): number { return this.bounceFrame; }

  createNidorinoSprite(): void {
    this.nidorinoSprite = CreateSprite(spriteTemplate(
      "sSpriteTemplate_Scene3_Nidorino", "sOam_Scene3_Nidorino",
      "sAnims_Scene3_Nidorino", (sprite) => Scene3_SpriteCB_NidorinoEnter(this, sprite), true), 0, 0, 9);
  }

  startNidorinoEntrance(sprite: Sprite, xStart: number, xEnd: number, time: number): void {
    sprite.data[0] = xStart << 4;
    sprite.data[1] = Math.trunc(((xEnd - xStart) << 4) / time);
    sprite.data[2] = time;
    sprite.data[3] = xEnd;
    sprite.data[4] = 0;
    sprite.x = xStart;
    sprite.y = 100;
    this.nidorinoEntering = true;
  }

  private nidorinoEntering = false;

  spriteCallbackNidorinoEnter(sprite: Sprite): void {
    const data = sprite.data;
    if (++data[4] >= 40 && data[1] > 1) data[1]--;
    data[0] += data[1];
    sprite.x = data[0] >> 4;
    if (sprite.x >= data[3]) {
      sprite.x = data[3];
      this.nidorinoEntering = false;
      sprite.callback = SpriteCallbackDummy;
    }
  }

  isNidorinoEntering(): boolean { return this.nidorinoEntering; }

  taskGengarEnter(): void {
    if (++this.gengarMoves >= 40 && this.gengarSpeed > 16) this.gengarSpeed -= 16;
    const scroll = ChangeBgX(0, this.gengarSpeed, BG_COORD_ADD);
    if (scroll >= 0x8000) ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
    if (scroll >= 0xef00) {
      ChangeBgX(0, 0xef00, BG_COORD_SET);
      this.gengarEnterTaskActive = false;
    }
  }

  createGrassSprite(): void {
    this.grassSprite = CreateSprite(spriteTemplate("sSpriteTemplate_Grass", "sOam_Grass",
      "sAnims_Grass", (sprite) => SpriteCB_Grass(this, sprite)), 296, 112, 7);
  }

  spriteCallbackGrass(sprite: Sprite): void {
    const data = sprite.data;
    if (data[0] === 0) {
      data[1] = sprite.x << 5;
      data[2] = 160;
      data[0] = 1;
    }
    if (data[0] === 1) {
      data[1] -= data[2];
      sprite.x = data[1] >> 5;
      if (sprite.x <= 52) { Scene3_SlowBgScroll(this); data[0] = 2; }
    } else if (data[0] === 2) {
      data[1] -= 32;
      sprite.x = data[1] >> 5;
      if (sprite.x <= -32) DestroySprite(sprite);
    }
  }

  updateFight(): void {
    const nidorino = gSprites[this.nidorinoSprite];
    if (!nidorino?.inUse) { this.done = true; return; }
    switch (this.state) {
      case 0:
        this.timer = 0;
        this.state++;
        break;
      case 1:
        if (++this.timer > 30) { Scene3_StartNidorinoCry(this, nidorino); this.state++; }
        break;
      case 2:
        if (!Scene3_NidorinoAnimIsRunning(this, nidorino)) { this.timer = 0; this.state++; }
        break;
      case 3:
        if (++this.timer > 30) {
          Scene3_PauseGengarBounce(this);
          Scene3_StartGengarAttack(this);
          this.timer = 0;
          this.state++;
        }
        break;
      case 4:
        if (this.attackLanded) { Scene3_StartNidorinoRecoil(this, nidorino); this.state++; }
        break;
      case 5:
        if (!Scene3_NidorinoAnimIsRunning(this, nidorino)) {
          Scene3_ResumeGengarBounce(this);
          this.timer = 0;
          this.state++;
        }
        break;
      case 6:
        if (++this.timer > 16) { Scene3_StartNidorinoHop(this, nidorino, 8, 12, 5); this.state++; }
        break;
      case 7:
        if (!Scene3_NidorinoAnimIsRunning(this, nidorino)) { Scene3_StartNidorinoHop(this, nidorino, 8, 12, 5); this.state++; }
        break;
      case 8:
        if (!Scene3_NidorinoAnimIsRunning(this, nidorino)) { this.timer = 0; this.state++; }
        break;
      case 9:
        if (++this.timer > 20) { Scene3_StartNidorinoAttack(this, nidorino); this.timer = 0; this.state++; }
        break;
      case 10:
        if (!Scene3_IsGengarMidBounce(this)) { Scene3_PauseGengarBounce(this); this.createGengarBackSprites(); this.state++; }
        break;
      case 11:
        HideBg(0);
        this.timer = 0;
        this.state++;
        break;
      case 12:
        if (++this.timer === 48) BeginNormalPaletteFade((1 << 1) | (1 << 2), 2, 0, 16, RGB_WHITE);
        if (this.timer > 120) {
          nidorino.x += nidorino.x2;
          nidorino.y += nidorino.y2;
          SetSpriteMatrixAnchor(nidorino, 0, 42);
          nidorino.callback = SpriteCallbackDummy;
          StartSpriteAffineAnim(nidorino, 1);
          const anchors = cdata<number[][]>("intro", "sGengarZoomMatrixAnchors");
          this.gengarSprites.forEach((id, i) => {
            const sprite = gSprites[id];
            if (!sprite?.inUse) return;
            StartSpriteAffineAnim(sprite, 1);
            sprite.callback = SpriteCallbackDummy;
            SetSpriteMatrixAnchor(sprite, anchors[i][0], anchors[i][1]);
          });
          this.timer = 0;
          this.state++;
        }
        break;
      case 13:
        if (++this.timer > 8) {
          gPlttBufferUnfaded.fill(RGB_WHITE, 16, 48);
          BeginNormalPaletteFade(PALETTES_ALL & ~1, -2, 0, 16, RGB_BLACK);
          this.state++;
        }
        break;
      case 14:
        if (!gPaletteFade.active) { this.timer = 0; this.state++; }
        break;
      case 15:
        if (++this.timer > 60) { this.phase = "exit"; this.state = 0; }
        break;
    }
  }

  private updateExit(): void {
    if (this.state++ === 0) FillPalette(RGB_BLACK, 0, 0x200);
    else this.done = true;
  }

  startNidorinoCry(sprite: Sprite): void {
    StartSpriteAnim(sprite, 2);
    sprite.data[0] = sprite.data[1] = sprite.data[2] = 0;
    sprite.y2 = 3;
    sprite.callback = (s) => SpriteCB_NidorinoCry(this, s);
  }

  spriteCallbackNidorinoCry(s: Sprite): void {
    const d = s.data;
    if (d[0] === 0 && ++d[1] > 8) {
      StartSpriteAnim(s, 1);
      s.y2 = 0;
      d[0] = 1;
    } else if (d[0] === 1) {
      sound.PlayCry_ByMode(SPECIES_NIDORINO, 0x3f, CRY_MODE_DOUBLES);
      d[1] = 0;
      d[0] = 2;
    } else if (d[0] === 2) {
      if (++d[2] > 1) { d[2] = 0; s.y2 = s.y2 === 0 ? 1 : 0; }
      if (++d[1] > 48) {
        StartSpriteAnim(s, 0);
        s.y2 = 0;
        s.callback = SpriteCallbackDummy;
      }
    }
  }

  startGengarAttack(): void {
    this.attackLanded = false;
    this.attackState = 0;
    this.attackSin = 64;
    this.attackBaseX = GetBgX(0);
  }

  taskGengarAttack(): void {
    switch (this.attackState) {
      case 0:
        this.attackFrame = 2;
        this.attackTimer = 0;
        this.attackMultY = 6;
        this.attackMultX = 32;
        this.attackState++;
        break;
      case 1:
        this.attackSin -= 2;
        if (++this.attackTimer > 15) { this.attackTimer = 0; this.attackState++; }
        break;
      case 2:
        if (++this.attackTimer === 14) this.attackLanded = true;
        if (this.attackTimer > 15) { this.attackTimer = 0; this.attackState++; }
        break;
      case 3:
        this.attackSin += 8;
        if (++this.attackTimer === 4) {
          Scene3_CreateGengarSwipeSprites(this);
          this.attackMultY = 32;
          this.attackMultX = 48;
          this.attackFrame = 3;
        }
        if (this.attackTimer > 7) { this.attackTimer = 0; this.attackState++; }
        break;
      case 4:
        this.attackSin -= 8;
        if (++this.attackTimer > 3) {
          this.attackFrame = 0;
          this.attackSin = 64;
          this.attackTimer = 0;
          this.attackState++;
        }
        break;
      default:
        this.attackState = -1;
        return;
    }
    const xSub = -((gSineTable[this.attackSin + 64] * this.attackMultX) >> 8);
    const ySub = this.attackMultY - ((gSineTable[this.attackSin] * this.attackMultY) >> 8);
    Scene3_ApplyGengarAnim(this, this.attackFrame, xSub, ySub, this.attackBaseX);
  }

  applyGengarAnim(frame: number, xSub: number, ySub: number, xBase: number): void {
    ChangeBgY(0, (frame << 15) + 0x1f000, BG_COORD_SET);
    ChangeBgX(0, xBase, BG_COORD_SET);
    ChangeBgX(0, xSub << 8, BG_COORD_SUB);
    ChangeBgY(0, ySub << 8, BG_COORD_SUB);
  }

  createGengarSwipeSprites(): void {
    const make = () => spriteTemplate("sSpriteTemplate_GengarSwipe", "sOam_Swipe", "sAnims_Swipe",
      (sprite) => SpriteCB_GengarSwipe(this, sprite));
    CreateSprite(make(), 132, 78, 6);
    const second = CreateSprite(make(), 132, 118, 6);
    if (second !== MAX_SPRITES) {
      const sprite = gSprites[second];
      sprite.oam.shape = SPRITE_SHAPE("32x16");
      sprite.oam.size = SPRITE_SIZE("32x16");
      CalcCenterToCornerVec(sprite, sprite.oam.shape, sprite.oam.size, sprite.oam.affineMode);
      StartSpriteAnim(sprite, 1);
    }
  }

  spriteCallbackGengarSwipe(sprite: Sprite): void {
    sprite.invisible = !sprite.invisible;
    if (sprite.animEnded) DestroySprite(sprite);
  }

  private createGengarBackSprites(): void {
    for (let i = 0; i < 4; i++) {
      const id = CreateSprite(spriteTemplate("sSpriteTemplate_Scene3_Gengar", "sOam_Scene3_Gengar",
        "sAnims_Scene3_Gengar", SpriteCallbackDummy, true), (i & 1) * 48 + 49, Math.floor(i / 2) * 64 + 72, 8);
      if (id === MAX_SPRITES) continue;
      const sprite = gSprites[id];
      StartSpriteAnim(sprite, i);
      if (i & 1) sprite.oam.shape = SPRITE_SHAPE("32x64");
      CalcCenterToCornerVec(sprite, sprite.oam.shape, sprite.oam.size, sprite.oam.affineMode);
      this.gengarSprites.push(id);
    }
  }

  startNidorinoRecoil(sprite: Sprite): void {
    StartSpriteAnim(sprite, 2);
    sprite.data.fill(0);
    sprite.data[7] = 40;
    sprite.callback = (s) => SpriteCB_NidorinoRecoil(this, s);
  }

  spriteCallbackNidorinoRecoil(s: Sprite): void {
    const d = s.data;
    switch (d[0]) {
      case 0:
        if (++d[1] > 4) { StartSpriteAnim(s, 3); d[0]++; }
        break;
      case 1:
        d[2] += d[7];
        d[3] += 8;
        s.x2 = d[2] >> 4;
        s.y2 = -((gSineTable[d[3]] * 3) >> 5);
        if (++d[5] > 0) { d[5] = 0; d[7]--; }
        if (++d[4] > 15) {
          StartSpriteAnim(s, 2);
          d[1] = 0;
          d[6] = 0x4757;
          d[7] = 28;
          d[0]++;
        }
        break;
      case 2:
        d[2] += d[7];
        s.x2 = d[2] >> 4;
        if (++d[1] > 6) {
          CreateNidorinoRecoilDustSprites(this, s.x + s.x2, s.y + s.y2, d[6]);
          d[6] = (Math.imul(d[6], 1103515245) << 16) >> 16;
        }
        if (d[1] > 12) { StartSpriteAnim(s, 0); d[1] = 0; d[0]++; }
        break;
      case 3:
        if (++d[1] > 16) Scene3_StartNidorinoHop(this, s, 16, -s.x2, 4);
        break;
    }
  }

  createRecoilDust(x: number, y: number, initialSeed: number): void {
    let seed = initialSeed;
    for (let i = 0; i < 2; i++) {
      const id = CreateSprite(spriteTemplate("sSpriteTemplate_NidorinoRecoilDust", "sOam_RecoilDust",
        "sAnims_RecoilDust", (sprite) => SpriteCB_RecoilDust(this, sprite)), x - 22, y + 24, 10);
      if (id !== MAX_SPRITES) {
        const d = gSprites[id].data;
        d[3] = seed % 13 + 8;
        d[4] = seed % 3;
        d[7] = i;
      }
      seed = (Math.imul(seed, 1103515245) << 16) >> 16;
    }
  }

  spriteCallbackRecoilDust(sprite: Sprite): void {
    const d = sprite.data;
    if (d[0] === 0) { d[1] = sprite.x << 4; d[2] = sprite.y << 4; d[0] = 1; }
    d[1] -= d[3];
    d[2] += d[4];
    sprite.x = d[1] >> 4;
    sprite.y = d[2] >> 4;
    if (sprite.animEnded) DestroySprite(sprite);
    if (++d[7] > 1) { d[7] = 0; sprite.invisible = !sprite.invisible; }
  }

  startNidorinoHop(sprite: Sprite, time: number, targetX: number, heightShift: number): void {
    const d = sprite.data;
    d[0] = 0;
    d[1] = time;
    d[2] = sprite.x2 << 4;
    d[3] = Math.trunc((targetX << 4) / time);
    d[4] = 0;
    d[5] = Math.trunc(0x800 / time);
    d[6] = 0;
    d[7] = heightShift;
    StartSpriteAnim(sprite, 2);
    sprite.callback = (s) => SpriteCB_NidorinoHop(this, s);
  }

  spriteCallbackNidorinoHop(s: Sprite): void {
      const data = s.data;
      switch (data[0]) {
        case 0:
          if (++data[6] > 4) { StartSpriteAnim(s, 3); data[6] = 0; data[0]++; }
          break;
        case 1:
          if (--data[1]) {
            data[2] += data[3];
            data[4] += data[5];
            s.x2 = data[2] >> 4;
            s.y2 = -(gSineTable[data[4] >> 4] >> data[7]);
          } else {
            s.x2 = (data[2] & 0xffff) >> 4;
            s.y2 = 0;
            StartSpriteAnim(s, 2);
            if (data[7] === 5) s.callback = SpriteCallbackDummy;
            else { data[6] = 0; data[0]++; }
          }
          break;
        case 2:
          if (++data[6] > 4) { StartSpriteAnim(s, 0); s.callback = SpriteCallbackDummy; }
          break;
      }
  }

  startNidorinoAttack(sprite: Sprite): void {
    sprite.data.fill(0);
    sprite.x += sprite.x2;
    sprite.x2 = 0;
    sprite.data[7] = 36;
    StartSpriteAnim(sprite, 2);
    sprite.callback = (s) => SpriteCB_NidorinoAttack(this, s);
  }

  spriteCallbackNidorinoAttack(s: Sprite): void {
      const d = s.data;
      switch (d[0]) {
        case 0:
          if (++d[1] & 1) { if (++d[2] & 1) s.x2++; else s.x2--; }
          if (d[1] > 17) { d[1] = 0; d[0]++; }
          break;
        case 1:
          if (++d[1] >= 40) { StartSpriteAnim(s, 4); d[1] = d[2] = 0; d[0]++; }
          break;
        case 2:
          d[1] += d[7];
          s.x2 = -(d[1] >> 4);
          s.y2 = -((gSineTable[d[1] >> 4] * 3) >> 4);
          d[2]++;
          if (d[7] > 12) d[7]--;
          if ((d[1] >> 4) > 63) s.callback = SpriteCallbackDummy;
          break;
      }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(ppu.renderFrame(), 0, 0);
  }
}
