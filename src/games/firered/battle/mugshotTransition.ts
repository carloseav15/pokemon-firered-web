// Mugshot transitions from battle_transition.c. Canvas replaces the BG0/OBJ
// window and affine hardware, while preserving their source graphics and task timing.
import * as C from "../generated/constants";
import { cdata, incbin, incbin16 } from "../hw/assets";
import { Sin } from "../hw/trig";
import { gTrainerFrontPicPaletteTable, gTrainerFrontPicTable, sheetBytes, symPalette } from "../pokemon/pics";
import { PlayerGenderToFrontTrainerPicId } from "../trainerPokemonSprites";

const W = 240, H = 160;
type TrainerPic = { image: HTMLCanvasElement; x: number; y: number; scaleX: number; scaleY: number; state: number; slideSpeed: number; slideAccel: number; done: boolean; slideDir: number };
type MugshotState = "init" | "gfx" | "banner" | "opponent" | "waitOpponent" | "waitPlayer" | "white" | "whiteToBlack" | "black" | "end" | "done";

export class MugshotTransitionEffect {
  private state: MugshotState = "init";
  private readonly banner: HTMLCanvasElement;
  private opponent!: TrainerPic;
  private player!: TrainerPic;
  private sinIndex = 0;
  private drawSinIndex = 0;
  private topBannerX = 1;
  private bottomBannerX = W - 1;
  private drawTopBannerX = 1;
  private drawBottomBannerX = W - 1;
  private bg0HOfsOpponent = 0;
  private bg0HOfsPlayer = 0;
  private timer = 0;
  private fadeSpread = 0;
  private fadeRows = new Array<number>(H).fill(0);
  private paletteWhite = false;
  private mugshotId = 0;
  private readonly playerGender: number;
  private readonly bannerPalette: Uint16Array;
  private readonly bannerTilemap = incbin16("sMugshotsTilemap");
  private readonly bannerGfx = incbin("sMugshotBanner_Gfx");
  private readonly picIds = cdata<number[]>("battle_transition", "sMugshotsTrainerPicIDsTable");
  private readonly opponentCoords = cdata<number[][]>("battle_transition", "sMugshotsOpponentCoords");
  private readonly opponentScales = cdata<number[][]>("battle_transition", "sMugshotsOpponentRotationScales");

  constructor(transitionId: number, playerGender: number) {
    if (transitionId === C.B_TRANSITION_LORELEI) this.Task_Lorelei();
    else if (transitionId === C.B_TRANSITION_BRUNO) this.Task_Bruno();
    else if (transitionId === C.B_TRANSITION_AGATHA) this.Task_Agatha();
    else if (transitionId === C.B_TRANSITION_LANCE) this.Task_Lance();
    else this.Task_Blue();
    this.playerGender = playerGender;
    const opponentPals = cdata<unknown[]>("battle_transition", "sOpponentMugshotsPals");
    const playerPals = cdata<unknown[]>("battle_transition", "sPlayerMugshotsPals");
    this.bannerPalette = symPalette(opponentPals[this.mugshotId]);
    const playerBannerPalette = symPalette(playerPals[playerGender] ?? playerPals[0]);
    for (let i = 0; i < 6; i++) this.bannerPalette[10 + i] = playerBannerPalette[i] ?? 0;
    this.banner = this.decodeBanner();
  }

  tick(): boolean {
    return this.DoMugshotTransition();
  }

  private Task_Lorelei(): void { this.DoMugshotTransition_SetId(0); }
  private Task_Bruno(): void { this.DoMugshotTransition_SetId(1); }
  private Task_Agatha(): void { this.DoMugshotTransition_SetId(2); }
  private Task_Lance(): void { this.DoMugshotTransition_SetId(3); }
  private Task_Blue(): void { this.DoMugshotTransition_SetId(4); }
  private DoMugshotTransition_SetId(id: number): void { this.mugshotId = id; }

  private DoMugshotTransition(): boolean {
    if (this.state === "init") return this.Mugshot_Init();
    if (this.state === "gfx") return this.Mugshot_SetGfx();
    if (this.state === "banner") return this.Mugshot_ShowBanner();
    if (this.state === "opponent") return this.Mugshot_StartOpponentSlide();
    if (this.state === "waitOpponent") return this.Mugshot_WaitStartPlayerSlide();
    if (this.state === "waitPlayer") return this.Mugshot_WaitPlayerSlide();
    if (this.state === "white") return this.Mugshot_GradualWhiteFade();
    if (this.state === "whiteToBlack") { this.Mugshot_InitFadeWhiteToBlack(); return this.Mugshot_FadeToBlack(); }
    if (this.state === "black") return this.Mugshot_FadeToBlack();
    if (this.state === "end") return this.Mugshot_End();
    return true;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (this.state === "done" || this.state === "end") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
    if (this.state === "init" || this.state === "gfx") { ctx.drawImage(snapshot, 0, 0); return; }
    this.HBlankCB_Mugshots(ctx);
    this.VBlankCB_Mugshots(ctx, snapshot);
    if (this.state === "opponent" || this.state === "waitOpponent" || this.state === "waitPlayer" || this.state === "white" || this.state === "whiteToBlack") {
      this.drawTrainerPic(ctx, this.opponent);
      this.drawTrainerPic(ctx, this.player);
    }
    this.VBlankCB_MugshotsFadeOut(ctx);
  }

  private VBlankCB_Mugshots(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (!(this.state === "banner" || this.state === "opponent" || this.state === "waitOpponent" || this.state === "waitPlayer" || this.state === "white" || this.state === "whiteToBlack")) return;
    let sinIndex = this.drawSinIndex;
    for (let y = 0; y < H; y++, sinIndex = (sinIndex + 16) & 0xff) {
      if (y < H / 2) {
        const x = Math.max(1, Math.min(W, this.drawTopBannerX + Sin(sinIndex, 16)));
        if (x > 0) ctx.drawImage(snapshot, 0, y, x, 1, 0, y, x, 1);
      } else {
        const x = Math.max(0, Math.min(W - 1, this.drawBottomBannerX - Sin(sinIndex, 16)));
        if (x < W) ctx.drawImage(snapshot, x, y, W - x, 1, x, y, W - x, 1);
      }
    }
  }

  private VBlankCB_MugshotsFadeOut(ctx: CanvasRenderingContext2D): void {
    if (this.state === "black" && this.paletteWhite) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(0,0,0,${Math.min(16, this.timer) / 16})`; ctx.fillRect(0, 0, W, H);
    } else if (this.state === "white" || this.state === "whiteToBlack") {
      for (let y = 0; y < H; y++) if (this.fadeRows[y]! > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.fadeRows[y]! / 16})`; ctx.fillRect(0, y, W, 1);
      }
    }
  }

  private Mugshot_Init(): boolean {
    this.Mugshots_CreateTrainerPics();
    this.sinIndex = 0; this.topBannerX = 1; this.bottomBannerX = W - 1;
    this.state = "gfx";
    return false;
  }

  private Mugshot_SetGfx(): boolean {
    this.state = "banner";
    return false;
  }

  private Mugshot_ShowBanner(): boolean {
    this.drawSinIndex = this.sinIndex;
    this.drawTopBannerX = this.topBannerX;
    this.drawBottomBannerX = this.bottomBannerX;
    this.sinIndex = (this.sinIndex + 16) & 0xff;
    this.topBannerX = Math.min(W, this.topBannerX + 8);
    this.bottomBannerX = Math.max(0, this.bottomBannerX - 8);
    this.bg0HOfsOpponent -= 8;
    this.bg0HOfsPlayer += 8;
    if (this.topBannerX === W && this.bottomBannerX === 0) this.state = "opponent";
    return false;
  }

  private Mugshot_StartOpponentSlide(): boolean {
    this.sinIndex = 0; this.topBannerX = 0; this.bottomBannerX = 0;
    this.drawSinIndex = 0; this.drawTopBannerX = W; this.drawBottomBannerX = 0;
    this.state = "waitOpponent";
    this.SetTrainerPicSlideDirection(this.opponent, 0);
    this.SetTrainerPicSlideDirection(this.player, 1);
    this.IncrementTrainerPicState(this.opponent);
    return false;
  }

  private Mugshot_WaitStartPlayerSlide(): boolean {
    this.bg0HOfsOpponent -= 8; this.bg0HOfsPlayer += 8;
    this.SpriteCB_MugshotTrainerPic(this.opponent);
    if (this.IsTrainerPicSlideDone(this.opponent)) {
      this.state = "waitPlayer";
      this.IncrementTrainerPicState(this.player);
    }
    return false;
  }

  private Mugshot_WaitPlayerSlide(): boolean {
    this.bg0HOfsOpponent -= 8; this.bg0HOfsPlayer += 8;
    this.SpriteCB_MugshotTrainerPic(this.opponent);
    this.SpriteCB_MugshotTrainerPic(this.player);
    if (this.IsTrainerPicSlideDone(this.player)) {
      this.state = "white"; this.timer = 0; this.fadeSpread = 0; this.fadeRows.fill(0);
    }
    return false;
  }

  private Mugshot_GradualWhiteFade(): boolean {
    this.bg0HOfsOpponent -= 8; this.bg0HOfsPlayer += 8;
    this.fadeSpread = Math.min(H / 2, this.fadeSpread + 2);
    let active = true;
    if (++this.timer & 1) {
      active = false;
      for (let i = 0; i <= this.fadeSpread; i++) for (const y of [H / 2 - i, H / 2 + i]) {
        if (this.fadeRows[y]! <= 15) { active = true; this.fadeRows[y] = this.fadeRows[y]! + 1; }
      }
    }
    if (this.fadeSpread === H / 2 && !active) this.state = "whiteToBlack";
    return false;
  }

  private Mugshot_InitFadeWhiteToBlack(): boolean {
    this.paletteWhite = true; this.timer = 0; this.state = "black"; return true;
  }

  private Mugshot_FadeToBlack(): boolean {
    this.timer++;
    if (this.timer > 15) this.state = "end";
    return false;
  }

  private Mugshot_End(): boolean { this.state = "done"; return true; }

  private Mugshots_CreateTrainerPics(): void {
    const picId = this.picIds[this.mugshotId]!;
    const coords = this.opponentCoords[this.mugshotId]!;
    const scale = this.opponentScales[this.mugshotId]!;
    this.opponent = this.CreateTrainerSprite(picId, coords[0]! - 32, coords[1]! + 42, 0, null);
    this.opponent.scaleX = scale[0]!;
    this.opponent.scaleY = scale[1]!;
    const playerPicId = PlayerGenderToFrontTrainerPicId(this.playerGender, true);
    this.player = this.CreateTrainerSprite(playerPicId, W + 32, 106, 0, null);
    this.player.scaleX = -512;
    this.player.scaleY = 512;
    this.player.slideDir = 1;
  }

  /** CreateTrainerSprite (field_effect.c); buffer-backed GBA sprites render from decoded Canvas images here. */
  CreateTrainerSprite(trainerSpriteId: number, x: number, y: number, _subpriority: number, _buffer: Uint8Array | null): TrainerPic {
    return { image: this.decodeTrainerPic(trainerSpriteId), x, y, scaleX: 256, scaleY: 256, state: 0, slideSpeed: 0, slideAccel: 0, done: false, slideDir: 0 };
  }

  private SetTrainerPicSlideDirection(sprite: TrainerPic, dir: number): void { sprite.slideDir = dir; }
  private IncrementTrainerPicState(sprite: TrainerPic): void { sprite.state++; }
  private IsTrainerPicSlideDone(sprite: TrainerPic): number { return sprite.done ? 1 : 0; }

  private SpriteCB_MugshotTrainerPic(sprite: TrainerPic): void {
    while (this.MugshotTrainerPic_Dispatch(sprite)) { /* C callback continues on TRUE. */ }
  }

  private MugshotTrainerPic_Dispatch(sprite: TrainerPic): boolean {
    if (sprite.state === 0 || sprite.state === 4 || sprite.state === 6) return this.MugshotTrainerPic_Pause(sprite);
    if (sprite.state === 1) return this.MugshotTrainerPic_Init(sprite);
    if (sprite.state === 2) return this.MugshotTrainerPic_Slide(sprite);
    if (sprite.state === 3) return this.MugshotTrainerPic_SlideSlow(sprite);
    return this.MugshotTrainerPic_SlideOffscreen(sprite);
  }

  private MugshotTrainerPic_Pause(_sprite: TrainerPic): boolean { return false; }
  private MugshotTrainerPic_Init(sprite: TrainerPic): boolean {
    sprite.state++;
    sprite.slideSpeed = [12, -12][sprite.slideDir]!;
    sprite.slideAccel = [-1, 1][sprite.slideDir]!;
    return true;
  }
  private MugshotTrainerPic_Slide(sprite: TrainerPic): boolean {
    sprite.x += sprite.slideSpeed;
    if ((sprite.slideDir && sprite.x < W - 107) || (!sprite.slideDir && sprite.x > 103)) sprite.state++;
    return false;
  }
  private MugshotTrainerPic_SlideSlow(sprite: TrainerPic): boolean {
    sprite.slideSpeed += sprite.slideAccel;
    sprite.x += sprite.slideSpeed;
    if (sprite.slideSpeed === 0) { sprite.state++; sprite.slideAccel = -sprite.slideAccel; sprite.done = true; }
    return false;
  }
  private MugshotTrainerPic_SlideOffscreen(sprite: TrainerPic): boolean {
    sprite.slideSpeed += sprite.slideAccel; sprite.x += sprite.slideSpeed;
    if (sprite.x < -31 || sprite.x > W + 31) sprite.state++;
    return false;
  }

  private drawTrainerPic(ctx: CanvasRenderingContext2D, sprite: TrainerPic): void {
    ctx.save(); ctx.translate(sprite.x, sprite.y); ctx.scale(sprite.scaleX / 256, sprite.scaleY / 256);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite.image, -32, -16); ctx.restore();
  }

  private HBlankCB_Mugshots(ctx: CanvasRenderingContext2D): void {
    const scrolls = [this.bg0HOfsOpponent, this.bg0HOfsPlayer];
    for (let y = 0; y < H; y++) {
      const sx = ((scrolls[y < H / 2 ? 0 : 1]! % 256) + 256) % 256;
      const first = Math.min(W, 256 - sx);
      ctx.drawImage(this.banner, sx, y, first, 1, 0, y, first, 1);
      if (first < W) ctx.drawImage(this.banner, 0, y, W - first, 1, first, y, W - first, 1);
    }
  }

  private decodeBanner(): HTMLCanvasElement {
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = H;
    const ctx = canvas.getContext("2d")!; const image = ctx.createImageData(256, H);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) {
      const entry = this.bannerTilemap[y * 32 + x] ?? 0; const tile = entry & 0x3ff;
      const hf = !!(entry & 0x400), vf = !!(entry & 0x800);
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        const tx = hf ? 7 - px : px, ty = vf ? 7 - py : py;
        const byte = this.bannerGfx[tile * 32 + ty * 4 + (tx >> 1)] ?? 0;
        const colorIndex = (tx & 1) ? byte >> 4 : byte & 15; const color = this.bannerPalette[colorIndex] ?? 0;
        const p = ((y * 8 + py) * 256 + x * 8 + px) * 4;
        image.data[p] = ((color & 31) * 255 / 31) | 0; image.data[p + 1] = (((color >> 5) & 31) * 255 / 31) | 0;
        image.data[p + 2] = (((color >> 10) & 31) * 255 / 31) | 0; image.data[p + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0); return canvas;
  }

  private decodeTrainerPic(picId: number): HTMLCanvasElement {
    const gfx = sheetBytes(gTrainerFrontPicTable()[picId]!);
    const palRef = gTrainerFrontPicPaletteTable()[picId]!.data;
    const palette = symPalette(palRef); const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 32;
    const ctx = canvas.getContext("2d")!; const image = ctx.createImageData(64, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const tile = (y >> 3) * 8 + (x >> 3); const byte = gfx[tile * 32 + (y & 7) * 4 + ((x & 7) >> 1)] ?? 0;
      const colorIndex = (x & 1) ? byte >> 4 : byte & 15; const color = palette[colorIndex] ?? 0; const p = (y * 64 + x) * 4;
      image.data[p] = ((color & 31) * 255 / 31) | 0; image.data[p + 1] = (((color >> 5) & 31) * 255 / 31) | 0;
      image.data[p + 2] = (((color >> 10) & 31) * 255 / 31) | 0; image.data[p + 3] = colorIndex === 0 ? 0 : 255;
    }
    ctx.putImageData(image, 0, 0); return canvas;
  }
}
