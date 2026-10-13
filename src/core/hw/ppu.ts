// A software model of the GBA picture processing unit: IO registers, VRAM,
// palette RAM and OAM, rendered one scanline at a time (modes 0-2, text and
// affine backgrounds, regular/affine/double-size sprites, windows, OBJ
// window, alpha blending and brightness effects, BG and OBJ mosaic).

export const REG_OFFSET_DISPCNT = 0x0;
export const REG_OFFSET_DISPSTAT = 0x4;
export const REG_OFFSET_VCOUNT = 0x6;
export const REG_OFFSET_BG0CNT = 0x8;
export const REG_OFFSET_BG1CNT = 0xa;
export const REG_OFFSET_BG2CNT = 0xc;
export const REG_OFFSET_BG3CNT = 0xe;
export const REG_OFFSET_BG0HOFS = 0x10;
export const REG_OFFSET_BG0VOFS = 0x12;
export const REG_OFFSET_BG1HOFS = 0x14;
export const REG_OFFSET_BG1VOFS = 0x16;
export const REG_OFFSET_BG2HOFS = 0x18;
export const REG_OFFSET_BG2VOFS = 0x1a;
export const REG_OFFSET_BG3HOFS = 0x1c;
export const REG_OFFSET_BG3VOFS = 0x1e;
export const REG_OFFSET_BG2PA = 0x20;
export const REG_OFFSET_BG2PB = 0x22;
export const REG_OFFSET_BG2PC = 0x24;
export const REG_OFFSET_BG2PD = 0x26;
export const REG_OFFSET_BG2X_L = 0x28;
export const REG_OFFSET_BG2X_H = 0x2a;
export const REG_OFFSET_BG2Y_L = 0x2c;
export const REG_OFFSET_BG2Y_H = 0x2e;
export const REG_OFFSET_BG3PA = 0x30;
export const REG_OFFSET_BG3PB = 0x32;
export const REG_OFFSET_BG3PC = 0x34;
export const REG_OFFSET_BG3PD = 0x36;
export const REG_OFFSET_BG3X_L = 0x38;
export const REG_OFFSET_BG3X_H = 0x3a;
export const REG_OFFSET_BG3Y_L = 0x3c;
export const REG_OFFSET_BG3Y_H = 0x3e;
export const REG_OFFSET_WIN0H = 0x40;
export const REG_OFFSET_WIN1H = 0x42;
export const REG_OFFSET_WIN0V = 0x44;
export const REG_OFFSET_WIN1V = 0x46;
export const REG_OFFSET_WININ = 0x48;
export const REG_OFFSET_WINOUT = 0x4a;
export const REG_OFFSET_MOSAIC = 0x4c;
export const REG_OFFSET_BLDCNT = 0x50;
export const REG_OFFSET_BLDALPHA = 0x52;
export const REG_OFFSET_BLDY = 0x54;
export const REG_OFFSET_IE = 0x200;
export const REG_OFFSET_IF = 0x202;
export const REG_OFFSET_IME = 0x208;

export const DISPCNT_MODE_0 = 0x0000;
export const DISPCNT_MODE_1 = 0x0001;
export const DISPCNT_MODE_2 = 0x0002;
export const DISPCNT_OBJ_1D_MAP = 0x0040;
export const DISPCNT_FORCED_BLANK = 0x0080;
export const DISPCNT_BG0_ON = 0x0100;
export const DISPCNT_BG1_ON = 0x0200;
export const DISPCNT_BG2_ON = 0x0400;
export const DISPCNT_BG3_ON = 0x0800;
export const DISPCNT_BG_ALL_ON = 0x0f00;
export const DISPCNT_OBJ_ON = 0x1000;
export const DISPCNT_WIN0_ON = 0x2000;
export const DISPCNT_WIN1_ON = 0x4000;
export const DISPCNT_OBJWIN_ON = 0x8000;

export const BLDCNT_TGT1_BG0 = 1 << 0;
export const BLDCNT_TGT1_BG1 = 1 << 1;
export const BLDCNT_TGT1_BG2 = 1 << 2;
export const BLDCNT_TGT1_BG3 = 1 << 3;
export const BLDCNT_TGT1_OBJ = 1 << 4;
export const BLDCNT_TGT1_BD = 1 << 5;
export const BLDCNT_TGT1_ALL = 0x3f;
export const BLDCNT_EFFECT_NONE = 0 << 6;
export const BLDCNT_EFFECT_BLEND = 1 << 6;
export const BLDCNT_EFFECT_LIGHTEN = 2 << 6;
export const BLDCNT_EFFECT_DARKEN = 3 << 6;
export const BLDCNT_TGT2_BG0 = 1 << 8;
export const BLDCNT_TGT2_BG1 = 1 << 9;
export const BLDCNT_TGT2_BG2 = 1 << 10;
export const BLDCNT_TGT2_BG3 = 1 << 11;
export const BLDCNT_TGT2_OBJ = 1 << 12;
export const BLDCNT_TGT2_BD = 1 << 13;
export const BLDCNT_TGT2_ALL = 0x3f00;

export const WININ_WIN0_BG0 = 1 << 0;
export const WININ_WIN0_BG1 = 1 << 1;
export const WININ_WIN0_BG2 = 1 << 2;
export const WININ_WIN0_BG3 = 1 << 3;
export const WININ_WIN0_BG_ALL = 0xf;
export const WININ_WIN0_OBJ = 1 << 4;
export const WININ_WIN0_CLR = 1 << 5;
export const WININ_WIN0_ALL = 0x3f;
export const WININ_WIN1_BG0 = 1 << 8;
export const WININ_WIN1_BG1 = 1 << 9;
export const WININ_WIN1_BG2 = 1 << 10;
export const WININ_WIN1_BG3 = 1 << 11;
export const WININ_WIN1_BG_ALL = 0xf00;
export const WININ_WIN1_OBJ = 1 << 12;
export const WININ_WIN1_CLR = 1 << 13;
export const WININ_WIN1_ALL = 0x3f00;
export const WINOUT_WIN01_BG0 = 1 << 0;
export const WINOUT_WIN01_BG1 = 1 << 1;
export const WINOUT_WIN01_BG2 = 1 << 2;
export const WINOUT_WIN01_BG3 = 1 << 3;
export const WINOUT_WIN01_BG_ALL = 0xf;
export const WINOUT_WIN01_OBJ = 1 << 4;
export const WINOUT_WIN01_CLR = 1 << 5;
export const WINOUT_WIN01_ALL = 0x3f;
export const WINOUT_WINOBJ_BG0 = 1 << 8;
export const WINOUT_WINOBJ_BG1 = 1 << 9;
export const WINOUT_WINOBJ_BG2 = 1 << 10;
export const WINOUT_WINOBJ_BG3 = 1 << 11;
export const WINOUT_WINOBJ_BG_ALL = 0xf00;
export const WINOUT_WINOBJ_OBJ = 1 << 12;
export const WINOUT_WINOBJ_CLR = 1 << 13;
export const WINOUT_WINOBJ_ALL = 0x3f00;

export const BGCNT_PRIORITY = (n: number) => n;
export const BGCNT_CHARBASE = (n: number) => n << 2;
export const BGCNT_MOSAIC = 0x0040;
export const BGCNT_16COLOR = 0x0000;
export const BGCNT_256COLOR = 0x0080;
export const BGCNT_SCREENBASE = (n: number) => n << 8;
export const BGCNT_WRAP = 0x2000;
export const BGCNT_TXT256x256 = 0x0000;
export const BGCNT_TXT512x256 = 0x4000;
export const BGCNT_TXT256x512 = 0x8000;
export const BGCNT_TXT512x512 = 0xc000;

export const WIN_RANGE = (a: number, b: number) => ((a & 0xff) << 8) | (b & 0xff);
export const BLDALPHA_BLEND = (target1: number, target2: number) => (target2 << 8) | target1;

export const DISPLAY_WIDTH = 240;
export const DISPLAY_HEIGHT = 160;
export const VRAM_SIZE = 0x18000;
export const OBJ_VRAM0 = 0x10000;
export const PLTT_SIZE = 0x400;
export const OAM_SIZE = 0x400;

// sprite shapes/sizes: [shape][size] -> [width, height]
export const OBJ_DIMENSIONS: Array<Array<[number, number]>> = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
  [[8, 8], [8, 8], [8, 8], [8, 8]],
];

const RGB_TABLE = new Uint32Array(0x8000);
for (let c = 0; c < 0x8000; c++) {
  const r = c & 0x1f;
  const g = (c >> 5) & 0x1f;
  const b = (c >> 10) & 0x1f;
  RGB_TABLE[c] = 0xff000000 | (((b << 3) | (b >> 2)) << 16) | (((g << 3) | (g >> 2)) << 8) | ((r << 3) | (r >> 2));
}

const LAYER_BD = 5;
const LAYER_OBJ = 4;

export class Ppu {
  /** I/O registers; BG2PA/PD and BG3PA/PD power on as 0x100 (identity affine matrix). */
  readonly io = (() => {
    const io = new Uint16Array(0x200);
    for (const reg of [REG_OFFSET_BG2PA, REG_OFFSET_BG2PD, REG_OFFSET_BG3PA, REG_OFFSET_BG3PD]) io[reg >> 1] = 0x100;
    return io;
  })();
  readonly vram = new Uint8Array(VRAM_SIZE);
  readonly pltt = new Uint16Array(PLTT_SIZE / 2);
  readonly oam = new Uint16Array(OAM_SIZE / 2);
  /** Called before each scanline is drawn (HBlank DMA / scanline effects). */
  hblank: ((line: number) => void) | null = null;
  vcount = 0;

  private readonly image: ImageData;
  private readonly out: Uint32Array;
  private readonly bgLine = [new Int16Array(240), new Int16Array(240), new Int16Array(240), new Int16Array(240)];
  private readonly objColor = new Int16Array(240);
  private readonly objPrio = new Uint8Array(240);
  private readonly objSemi = new Uint8Array(240);
  private readonly objWin = new Uint8Array(240);
  private readonly winMask = new Uint8Array(240);
  private readonly affX = new Int32Array(4);
  private readonly affY = new Int32Array(4);
  private readonly latch = [true, true, true, true];

  /** Registers back to their power-on values. */
  resetIo(): void {
    this.io.fill(0);
    for (const reg of [REG_OFFSET_BG2PA, REG_OFFSET_BG2PD, REG_OFFSET_BG3PA, REG_OFFSET_BG3PD]) this.io[reg >> 1] = 0x100;
  }

  constructor() {
    this.image = new ImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    this.out = new Uint32Array(this.image.data.buffer);
  }

  reg(offset: number): number {
    return this.io[offset >> 1];
  }

  setReg(offset: number, value: number): void {
    this.io[offset >> 1] = value & 0xffff;
    if (offset >= 0x28 && offset < 0x30) this.latch[2] = true;
    else if (offset >= 0x38 && offset < 0x40) this.latch[3] = true;
  }

  vram16(offset: number): number {
    return this.vram[offset] | (this.vram[offset + 1] << 8);
  }

  // ---------------------------------------------------------------- frame

  renderFrame(): ImageData {
    this.latch[2] = this.latch[3] = true;
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      this.vcount = y;
      this.hblank?.(y);
      this.renderLine(y);
    }
    this.vcount = DISPLAY_HEIGHT;
    return this.image;
  }

  private renderLine(y: number): void {
    const dispcnt = this.io[0];
    const rowOut = y * DISPLAY_WIDTH;
    if (dispcnt & DISPCNT_FORCED_BLANK) {
      this.out.fill(0xffffffff, rowOut, rowOut + DISPLAY_WIDTH);
      return;
    }
    const mode = dispcnt & 7;
    const mosaic = this.io[REG_OFFSET_MOSAIC >> 1];
    // Backgrounds.
    const enabled = [false, false, false, false];
    for (let bg = 0; bg < 4; bg++) {
      if (!(dispcnt & (DISPCNT_BG0_ON << bg))) continue;
      const cnt = this.io[(REG_OFFSET_BG0CNT >> 1) + bg];
      const mosaicY = cnt & BGCNT_MOSAIC ? ((mosaic >> 4) & 0xf) + 1 : 1;
      const lineY = mosaicY > 1 ? y - (y % mosaicY) : y;
      if (mode === 0 || (mode === 1 && bg < 2)) {
        this.renderTextBg(bg, cnt, lineY);
        enabled[bg] = true;
      } else if ((mode === 1 && bg === 2) || (mode === 2 && bg >= 2)) {
        this.renderAffineBg(bg, cnt, y);
        enabled[bg] = true;
      } else {
        continue;
      }
      if (cnt & BGCNT_MOSAIC) {
        const mx = (mosaic & 0xf) + 1;
        if (mx > 1) {
          const line = this.bgLine[bg];
          for (let x = 0; x < 240; x++) line[x] = line[x - (x % mx)];
        }
      }
    }
    // Sprites.
    this.objColor.fill(-1);
    this.objWin.fill(0);
    const objOn = (dispcnt & DISPCNT_OBJ_ON) !== 0;
    if (objOn) this.renderObjects(y, dispcnt);
    // Windows: winMask bits = enable for BG0..3, OBJ (bit4), effects (bit5).
    const winAny = dispcnt & (DISPCNT_WIN0_ON | DISPCNT_WIN1_ON | DISPCNT_OBJWIN_ON);
    if (!winAny) {
      this.winMask.fill(0x3f);
    } else {
      const winin = this.io[REG_OFFSET_WININ >> 1];
      const winout = this.io[REG_OFFSET_WINOUT >> 1];
      this.winMask.fill(winout & 0x3f);
      if (dispcnt & DISPCNT_OBJWIN_ON) {
        const m = (winout >> 8) & 0x3f;
        for (let x = 0; x < 240; x++) if (this.objWin[x]) this.winMask[x] = m;
      }
      if (dispcnt & DISPCNT_WIN1_ON) this.applyWindow(1, y, (winin >> 8) & 0x3f);
      if (dispcnt & DISPCNT_WIN0_ON) this.applyWindow(0, y, winin & 0x3f);
    }
    // Composite.
    const bldcnt = this.io[REG_OFFSET_BLDCNT >> 1];
    const effect = (bldcnt >> 6) & 3;
    const bldalpha = this.io[REG_OFFSET_BLDALPHA >> 1];
    const eva = Math.min(16, bldalpha & 0x1f);
    const evb = Math.min(16, (bldalpha >> 8) & 0x1f);
    const evy = Math.min(16, this.io[REG_OFFSET_BLDY >> 1] & 0x1f);
    const prio = [0, 0, 0, 0];
    for (let bg = 0; bg < 4; bg++) prio[bg] = this.io[(REG_OFFSET_BG0CNT >> 1) + bg] & 3;
    const pltt = this.pltt;
    const backdrop = pltt[0];
    for (let x = 0; x < 240; x++) {
      const mask = this.winMask[x];
      let topLayer = LAYER_BD;
      let topColor = backdrop;
      let topPrio = 4;
      let secLayer = LAYER_BD;
      let secColor = backdrop;
      let secPrio = 5;
      for (let bg = 0; bg < 4; bg++) {
        if (!enabled[bg] || !(mask & (1 << bg))) continue;
        const c = this.bgLine[bg][x];
        if (c < 0) continue;
        const p = prio[bg];
        if (p < topPrio) {
          secLayer = topLayer; secColor = topColor; secPrio = topPrio;
          topLayer = bg; topColor = pltt[c]; topPrio = p;
        } else if (p < secPrio) {
          secLayer = bg; secColor = pltt[c]; secPrio = p;
        }
      }
      let semi = false;
      if (objOn && (mask & 0x10)) {
        const oc = this.objColor[x];
        if (oc >= 0) {
          const p = this.objPrio[x];
          if (p <= topPrio) {
            secLayer = topLayer; secColor = topColor; secPrio = topPrio;
            topLayer = LAYER_OBJ; topColor = pltt[oc]; topPrio = p;
            semi = this.objSemi[x] !== 0;
          } else if (p <= secPrio) {
            secLayer = LAYER_OBJ; secColor = pltt[oc]; secPrio = p;
          }
        }
      }
      let color = topColor;
      const effectsOn = (mask & 0x20) !== 0;
      if (semi && (bldcnt & (0x100 << secLayer))) {
        color = blend(topColor, secColor, eva, evb);
      } else if (effectsOn && effect !== 0 && (bldcnt & (1 << topLayer))) {
        if (effect === 1) {
          if (bldcnt & (0x100 << secLayer)) color = blend(topColor, secColor, eva, evb);
        } else if (effect === 2) {
          color = brighten(topColor, evy);
        } else {
          color = darken(topColor, evy);
        }
      }
      this.out[rowOut + x] = RGB_TABLE[color & 0x7fff];
    }
  }

  private applyWindow(win: number, y: number, bits: number): void {
    const h = this.io[(REG_OFFSET_WIN0H >> 1) + win];
    const v = this.io[(REG_OFFSET_WIN0V >> 1) + win];
    let x1 = h >> 8;
    let x2 = h & 0xff;
    const y1 = v >> 8;
    let y2 = v & 0xff;
    if (y2 > 160 || y2 < y1) y2 = 160;
    const insideY = y1 <= y2 ? y >= y1 && y < y2 : y >= y1 || y < y2;
    if (!insideY) return;
    if (x2 > 240 || x1 > x2) {
      if (x1 > x2 && x2 <= 240) {
        // wrap-around horizontal window
        for (let x = 0; x < 240; x++) if (x >= x1 || x < x2) this.winMask[x] = bits;
        return;
      }
      x2 = 240;
    }
    for (let x = x1; x < x2 && x < 240; x++) this.winMask[x] = bits;
  }

  private renderTextBg(bg: number, cnt: number, y: number): void {
    const line = this.bgLine[bg];
    const hofs = this.io[(REG_OFFSET_BG0HOFS >> 1) + bg * 2] & 0x1ff;
    const vofs = this.io[(REG_OFFSET_BG0VOFS >> 1) + bg * 2] & 0x1ff;
    const charBase = ((cnt >> 2) & 3) * 0x4000;
    const screenBase = ((cnt >> 8) & 0x1f) * 0x800;
    const is8bpp = (cnt & BGCNT_256COLOR) !== 0;
    const size = cnt >> 14;
    const wMask = size & 1 ? 511 : 255;
    const hMask = size & 2 ? 511 : 255;
    const py = (y + vofs) & hMask;
    const blocksWide = size & 1 ? 2 : 1;
    const vram = this.vram;
    const tileRowBase = screenBase + ((py >> 8) * blocksWide) * 0x800 + ((py & 255) >> 3) * 64;
    const fineY = py & 7;
    for (let x = 0; x < 240; x++) {
      const px = (x + hofs) & wMask;
      const entryAddr = tileRowBase + (px >> 8) * 0x800 + ((px & 255) >> 3) * 2;
      const entry = vram[entryAddr] | (vram[entryAddr + 1] << 8);
      const tile = entry & 0x3ff;
      let tx = px & 7;
      let ty = fineY;
      if (entry & 0x400) tx = 7 - tx;
      if (entry & 0x800) ty = 7 - ty;
      if (is8bpp) {
        const addr = charBase + tile * 64 + ty * 8 + tx;
        const idx = addr < 0x10000 ? vram[addr] : 0;
        line[x] = idx ? idx : -1;
      } else {
        const addr = charBase + tile * 32 + ty * 4 + (tx >> 1);
        const byte = addr < 0x10000 ? vram[addr] : 0;
        const idx = tx & 1 ? byte >> 4 : byte & 0xf;
        line[x] = idx ? ((entry >> 12) << 4) | idx : -1;
      }
    }
  }

  private renderAffineBg(bg: number, cnt: number, y: number): void {
    const line = this.bgLine[bg];
    const base = bg === 2 ? REG_OFFSET_BG2PA >> 1 : REG_OFFSET_BG3PA >> 1;
    const io = this.io;
    const pa = (io[base] << 16) >> 16;
    const pb = (io[base + 1] << 16) >> 16;
    const pc = (io[base + 2] << 16) >> 16;
    const pd = (io[base + 3] << 16) >> 16;
    if (this.latch[bg] || y === 0) {
      const rx = (io[base + 4] | (io[base + 5] << 16)) << 4 >> 4;
      const ry = (io[base + 6] | (io[base + 7] << 16)) << 4 >> 4;
      this.affX[bg] = rx;
      this.affY[bg] = ry;
      this.latch[bg] = false;
    }
    const charBase = ((cnt >> 2) & 3) * 0x4000;
    const screenBase = ((cnt >> 8) & 0x1f) * 0x800;
    const sizePx = 128 << (cnt >> 14);
    const tilesWide = sizePx >> 3;
    const wrap = (cnt & BGCNT_WRAP) !== 0;
    let cx = this.affX[bg];
    let cy = this.affY[bg];
    const vram = this.vram;
    for (let x = 0; x < 240; x++) {
      let tx = cx >> 8;
      let ty = cy >> 8;
      cx += pa;
      cy += pc;
      if (wrap) {
        tx &= sizePx - 1;
        ty &= sizePx - 1;
      } else if (tx < 0 || ty < 0 || tx >= sizePx || ty >= sizePx) {
        line[x] = -1;
        continue;
      }
      const tile = vram[screenBase + (ty >> 3) * tilesWide + (tx >> 3)];
      const idx = vram[charBase + tile * 64 + (ty & 7) * 8 + (tx & 7)];
      line[x] = idx ? idx : -1;
    }
    this.affX[bg] += pb;
    this.affY[bg] += pd;
  }

  private renderObjects(y: number, dispcnt: number): void {
    const oam = this.oam;
    const vram = this.vram;
    const oneD = (dispcnt & DISPCNT_OBJ_1D_MAP) !== 0;
    const mosaic = this.io[REG_OFFSET_MOSAIC >> 1];
    const mosX = ((mosaic >> 8) & 0xf) + 1;
    const mosY = ((mosaic >> 12) & 0xf) + 1;
    for (let i = 0; i < 128; i++) {
      const a0 = oam[i * 4];
      const a1 = oam[i * 4 + 1];
      const a2 = oam[i * 4 + 2];
      const affMode = (a0 >> 8) & 3;
      if (affMode === 2) continue;
      const objMode = (a0 >> 10) & 3;
      if (objMode === 3) continue;
      const shape = a0 >> 14;
      const size = a1 >> 14;
      const [w, h] = OBJ_DIMENSIONS[shape][size];
      const doubleSize = affMode === 3;
      const bw = doubleSize ? w * 2 : w;
      const bh = doubleSize ? h * 2 : h;
      let oy = a0 & 0xff;
      if (oy + bh > 256) oy -= 256;
      let line = y - oy;
      if (line < 0 || line >= bh) continue;
      const objMosaic = (a0 & 0x1000) !== 0;
      if (objMosaic && mosY > 1) line -= (y % mosY);
      let ox = a1 & 0x1ff;
      if (ox >= 240) ox -= 512;
      const is8bpp = (a0 & 0x2000) !== 0;
      const tileBase = a2 & 0x3ff;
      const prio = (a2 >> 10) & 3;
      const palBase = 256 + (is8bpp ? 0 : (a2 >> 12) << 4);
      const rowTiles = oneD ? (w >> 3) * (is8bpp ? 2 : 1) : 32;
      const affine = affMode === 1 || affMode === 3;
      let pa = 256, pb = 0, pc = 0, pd = 256;
      if (affine) {
        const m = ((a1 >> 9) & 0x1f) * 16;
        pa = (oam[m + 3] << 16) >> 16;
        pb = (oam[m + 7] << 16) >> 16;
        pc = (oam[m + 11] << 16) >> 16;
        pd = (oam[m + 15] << 16) >> 16;
      }
      const hflip = !affine && (a1 & 0x1000) !== 0;
      const vflip = !affine && (a1 & 0x2000) !== 0;
      for (let sx = 0; sx < bw; sx++) {
        const x = ox + sx;
        if (x < 0 || x >= 240) continue;
        let tx: number;
        let ty: number;
        if (affine) {
          const dx = sx - (bw >> 1);
          const dy = line - (bh >> 1);
          tx = ((pa * dx + pb * dy) >> 8) + (w >> 1);
          ty = ((pc * dx + pd * dy) >> 8) + (h >> 1);
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        } else {
          tx = hflip ? w - 1 - sx : sx;
          ty = vflip ? h - 1 - line : line;
        }
        if (objMosaic && mosX > 1) tx -= tx % mosX;
        let idx: number;
        if (is8bpp) {
          const tile = (tileBase & ~1) + (ty >> 3) * rowTiles + (tx >> 3) * 2;
          idx = vram[OBJ_VRAM0 + ((tile * 32 + (ty & 7) * 8 + (tx & 7)) & 0x7fff)];
        } else {
          const tile = tileBase + (ty >> 3) * rowTiles + (tx >> 3);
          const byte = vram[OBJ_VRAM0 + ((tile * 32 + (ty & 7) * 4 + ((tx & 7) >> 1)) & 0x7fff)];
          idx = tx & 1 ? byte >> 4 : byte & 0xf;
        }
        if (!idx) continue;
        if (objMode === 2) {
          this.objWin[x] = 1;
          continue;
        }
        if (this.objColor[x] >= 0 && this.objPrio[x] <= prio) continue;
        this.objColor[x] = palBase + idx;
        this.objPrio[x] = prio;
        this.objSemi[x] = objMode === 1 ? 1 : 0;
      }
    }
  }
}

function blend(a: number, b: number, eva: number, evb: number): number {
  const r = Math.min(31, ((a & 0x1f) * eva + (b & 0x1f) * evb) >> 4);
  const g = Math.min(31, (((a >> 5) & 0x1f) * eva + ((b >> 5) & 0x1f) * evb) >> 4);
  const bl = Math.min(31, (((a >> 10) & 0x1f) * eva + ((b >> 10) & 0x1f) * evb) >> 4);
  return r | (g << 5) | (bl << 10);
}

function brighten(a: number, evy: number): number {
  const r = a & 0x1f, g = (a >> 5) & 0x1f, b = (a >> 10) & 0x1f;
  return (r + (((31 - r) * evy) >> 4)) | ((g + (((31 - g) * evy) >> 4)) << 5) | ((b + (((31 - b) * evy) >> 4)) << 10);
}

function darken(a: number, evy: number): number {
  const r = a & 0x1f, g = (a >> 5) & 0x1f, b = (a >> 10) & 0x1f;
  return (r - ((r * evy) >> 4)) | ((g - ((g * evy) >> 4)) << 5) | ((b - ((b * evy) >> 4)) << 10);
}

export const ppu = new Ppu();
