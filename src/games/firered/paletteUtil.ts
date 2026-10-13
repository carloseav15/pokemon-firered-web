// Port of palette_util.c: general flashing/fading utility (roulette wheel flash and pulse blend).

import { gPlttBufferFaded, gPlttBufferUnfaded, BlendPalette, gPaletteFade, GET_R, GET_G, GET_B, RGB } from "./hw/palette";

export const FLASHUTIL_USE_EXISTING_COLOR = 1 << 15;

export interface PulseBlendSettings {
  blendColor: number;
  paletteOffset: number;
  numColors: number;
  delay: number;
  numFadeCycles: number;
  maxBlendCoeff: number; // s8:4
  fadeType: number;      // s8:2
  restorePaletteOnUnload: number | boolean;
  unk7_7: number | boolean;
}

export interface PulseBlendPalette {
  paletteSelector: number;
  blendCoeff: number;     // u8:4
  fadeDirection: number;  // u8:1
  unk1_5: number;
  available: number;
  inUse: number;
  delayCounter: number;
  fadeCycleCounter: number;
  pulseBlendSettings: PulseBlendSettings;
}

export interface PulseBlend {
  usedPulseBlendPalettes: number;
  pulseBlendPalettes: PulseBlendPalette[];
}

export interface RouletteFlashSettings {
  color: number;
  paletteOffset: number;
  numColors: number;
  delay: number;
  unk6?: number;
  numFadeCycles: number;
  unk7_5?: number;
  colorDeltaDir: number;
}

export interface RouletteFlashPalette {
  state: number;
  available: boolean;
  delayCounter: number;
  fadeCycleCounter: number;
  colorDelta: number;
  settings: RouletteFlashSettings;
}

export interface RouletteFlashUtil {
  enabled: number;
  unused: number;
  flags: number;
  palettes: RouletteFlashPalette[];
}

function createEmptyFlashPalette(): RouletteFlashPalette {
  return {
    state: 0,
    available: false,
    delayCounter: 0,
    fadeCycleCounter: 0,
    colorDelta: 1,
    settings: { color: 0, paletteOffset: 0, numColors: 0, delay: 0, numFadeCycles: 0, colorDeltaDir: 0 },
  };
}

export function RouletteFlash_Reset(flash: RouletteFlashUtil): void {
  flash.enabled = 0;
  flash.flags = 0;
  flash.palettes = Array.from({ length: 16 }, () => createEmptyFlashPalette());
}

export function RouletteFlash_Add(flash: RouletteFlashUtil, id: number, settings: RouletteFlashSettings): number {
  if (id >= flash.palettes.length || flash.palettes[id]!.available) return 0xff;
  const pal = flash.palettes[id]!;
  pal.settings = { ...settings };
  pal.state = 0;
  pal.available = true;
  pal.fadeCycleCounter = 0;
  pal.delayCounter = 0;
  pal.colorDelta = settings.colorDeltaDir < 0 ? -1 : 1;
  return id;
}

function RouletteFlash_Remove(flash: RouletteFlashUtil, id: number): number {
  if (id >= flash.palettes.length || !flash.palettes[id]!.available) return 0xff;
  flash.palettes[id] = createEmptyFlashPalette();
  return id;
}

function RouletteFlash_FadePalette(pal: RouletteFlashPalette): number {
  const delta = pal.colorDelta;
  for (let i = 0; i < pal.settings.numColors; i++) {
    const idx = pal.settings.paletteOffset + i;
    const faded = gPlttBufferFaded[idx]!;
    let r = GET_R(faded), g = GET_G(faded), b = GET_B(faded);

    switch (pal.state) {
      case 1:
        if (r + delta >= 0 && r + delta < 32) r += delta;
        if (g + delta >= 0 && g + delta < 32) g += delta;
        if (b + delta >= 0 && b + delta < 32) b += delta;
        break;
      case 2: {
        const unfaded = gPlttBufferUnfaded[idx]!;
        const ur = GET_R(unfaded), ug = GET_G(unfaded), ub = GET_B(unfaded);
        if (delta < 0) {
          if (r + delta >= ur) r += delta;
          if (g + delta >= ug) g += delta;
          if (b + delta >= ub) b += delta;
        } else {
          if (r + delta <= ur) r += delta;
          if (g + delta <= ug) g += delta;
          if (b + delta <= ub) b += delta;
        }
        break;
      }
    }
    gPlttBufferFaded[idx] = RGB(r, g, b) | (faded & 0x8000);
  }

  if (pal.fadeCycleCounter++ !== pal.settings.numFadeCycles) {
    return 0;
  } else {
    pal.fadeCycleCounter = 0;
    pal.colorDelta *= -1;
    pal.state = pal.state === 1 ? 2 : 1;
    return 1;
  }
}

function RouletteFlash_FlashPalette(pal: RouletteFlashPalette): number {
  const offset = pal.settings.paletteOffset;
  switch (pal.state) {
    case 1:
      for (let i = 0; i < pal.settings.numColors; i++) gPlttBufferFaded[offset + i] = pal.settings.color;
      pal.state++;
      break;
    case 2:
      for (let i = 0; i < pal.settings.numColors; i++) gPlttBufferFaded[offset + i] = gPlttBufferUnfaded[offset + i]!;
      pal.state--;
      break;
  }
  return 1;
}

export function RouletteFlash_Run(flash: RouletteFlashUtil): void {
  if (!flash.enabled) return;
  for (let i = 0; i < flash.palettes.length; i++) {
    if ((flash.flags >> i) & 1) {
      const pal = flash.palettes[i]!;
      if (--pal.delayCounter === -1 || pal.delayCounter === 0xff) {
        if (pal.settings.color & FLASHUTIL_USE_EXISTING_COLOR) RouletteFlash_FadePalette(pal);
        else RouletteFlash_FlashPalette(pal);
        pal.delayCounter = pal.settings.delay;
      }
    }
  }
}

export function RouletteFlash_Enable(flash: RouletteFlashUtil, flags: number): void {
  flash.enabled++;
  for (let i = 0; i < flash.palettes.length; i++) {
    if ((flags >> i) & 1) {
      if (flash.palettes[i]!.available) {
        flash.flags |= 1 << i;
        flash.palettes[i]!.state = 1;
      }
    }
  }
}

export function RouletteFlash_Stop(flash: RouletteFlashUtil, flags: number): void {
  for (let i = 0; i < flash.palettes.length; i++) {
    if ((flash.flags >> i) & 1) {
      const pal = flash.palettes[i]!;
      if (pal.available && ((flags >> i) & 1)) {
        const offset = pal.settings.paletteOffset;
        for (let c = 0; c < pal.settings.numColors; c++) gPlttBufferFaded[offset + c] = gPlttBufferUnfaded[offset + c]!;
        pal.state = 0;
        pal.fadeCycleCounter = 0;
        pal.delayCounter = 0;
        pal.colorDelta = pal.settings.colorDeltaDir < 0 ? -1 : 1;
      }
    }
  }
  if (flags === 0xffff) {
    flash.enabled = 0;
    flash.flags = 0;
  } else {
    flash.flags &= ~flags;
  }
}

function createEmptyPulseBlendPalette(selector: number): PulseBlendPalette {
  return {
    paletteSelector: selector,
    blendCoeff: 0,
    fadeDirection: 0,
    unk1_5: 0,
    available: 1,
    inUse: 0,
    delayCounter: 0,
    fadeCycleCounter: 0,
    pulseBlendSettings: { blendColor: 0, paletteOffset: 0, numColors: 0, delay: 0, numFadeCycles: 0, maxBlendCoeff: 0, fadeType: 0, restorePaletteOnUnload: 0, unk7_7: 0 },
  };
}

export function InitPulseBlend(pulseBlend: PulseBlend): void {
  pulseBlend.usedPulseBlendPalettes = 0;
  pulseBlend.pulseBlendPalettes = Array.from({ length: 16 }, (_, i) => createEmptyPulseBlendPalette(i));
}

export function InitPulseBlendPaletteSettings(pulseBlend: PulseBlend, settings: PulseBlendSettings): number {
  let idx = -1;
  for (let i = 0; i < 16; i++) {
    if (!pulseBlend.pulseBlendPalettes[i]!.inUse) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return 0xff;
  const p = pulseBlend.pulseBlendPalettes[idx]!;
  p.blendCoeff = 0;
  p.fadeDirection = 0;
  p.available = 1;
  p.inUse = 1;
  p.delayCounter = 0;
  p.fadeCycleCounter = 0;
  p.pulseBlendSettings = { ...settings };
  return idx;
}

function ClearPulseBlendPalettesSettings(pulseBlendPalette: PulseBlendPalette): void {
  if (!pulseBlendPalette.available && pulseBlendPalette.pulseBlendSettings.restorePaletteOnUnload) {
    const offset = pulseBlendPalette.pulseBlendSettings.paletteOffset;
    for (let i = 0; i < pulseBlendPalette.pulseBlendSettings.numColors; i++) gPlttBufferFaded[offset + i] = gPlttBufferUnfaded[offset + i]!;
  }
  pulseBlendPalette.pulseBlendSettings = { blendColor: 0, paletteOffset: 0, numColors: 0, delay: 0, numFadeCycles: 0, maxBlendCoeff: 0, fadeType: 0, restorePaletteOnUnload: 0, unk7_7: 0 };
  pulseBlendPalette.blendCoeff = 0;
  pulseBlendPalette.fadeDirection = 0;
  pulseBlendPalette.unk1_5 = 0;
  pulseBlendPalette.available = 1;
  pulseBlendPalette.inUse = 0;
  pulseBlendPalette.fadeCycleCounter = 0;
  pulseBlendPalette.delayCounter = 0;
}

export function UnloadUsedPulseBlendPalettes(pulseBlend: PulseBlend, pulseBlendPaletteSelector: number, multiSelection: number | boolean): void {
  if (!multiSelection) {
    ClearPulseBlendPalettesSettings(pulseBlend.pulseBlendPalettes[pulseBlendPaletteSelector & 0xf]!);
  } else {
    let selector = pulseBlendPaletteSelector;
    for (let i = 0; i < 16; i++) {
      if ((selector & 1) && pulseBlend.pulseBlendPalettes[i]!.inUse) ClearPulseBlendPalettesSettings(pulseBlend.pulseBlendPalettes[i]!);
      selector >>= 1;
    }
  }
}

export function MarkUsedPulseBlendPalettes(pulseBlend: PulseBlend, pulseBlendPaletteSelector: number, multiSelection: number | boolean): void {
  if (!multiSelection) {
    const i = pulseBlendPaletteSelector & 0xf;
    pulseBlend.pulseBlendPalettes[i]!.available = 0;
    pulseBlend.usedPulseBlendPalettes |= 1 << i;
  } else {
    let selector = pulseBlendPaletteSelector;
    for (let i = 0; i < 16; i++) {
      if ((selector & 1) && pulseBlend.pulseBlendPalettes[i]!.inUse && pulseBlend.pulseBlendPalettes[i]!.available) {
        pulseBlend.pulseBlendPalettes[i]!.available = 0;
        pulseBlend.usedPulseBlendPalettes |= 1 << i;
      }
      selector >>= 1;
    }
  }
}

export function UnmarkUsedPulseBlendPalettes(pulseBlend: PulseBlend, pulseBlendPaletteSelector: number, multiSelection: number | boolean): void {
  if (!multiSelection) {
    const idx = pulseBlendPaletteSelector & 0xf;
    const p = pulseBlend.pulseBlendPalettes[idx]!;
    if (!p.available && p.inUse) {
      if (p.pulseBlendSettings.restorePaletteOnUnload) {
        const offset = p.pulseBlendSettings.paletteOffset;
        for (let i = 0; i < p.pulseBlendSettings.numColors; i++) gPlttBufferFaded[offset + i] = gPlttBufferUnfaded[offset + i]!;
      }
      p.available = 1;
      pulseBlend.usedPulseBlendPalettes &= ~(1 << idx);
    }
  } else {
    let selector = pulseBlendPaletteSelector;
    for (let j = 0; j < 16; j++) {
      const p = pulseBlend.pulseBlendPalettes[j]!;
      if ((selector & 1) && !p.available && p.inUse) {
        if (p.pulseBlendSettings.restorePaletteOnUnload) {
          const offset = p.pulseBlendSettings.paletteOffset;
          for (let i = 0; i < p.pulseBlendSettings.numColors; i++) gPlttBufferFaded[offset + i] = gPlttBufferUnfaded[offset + i]!;
        }
        p.available = 1;
        pulseBlend.usedPulseBlendPalettes &= ~(1 << j);
      }
      selector >>= 1;
    }
  }
}

export function UpdatePulseBlend(pulseBlend: PulseBlend): void {
  if (!pulseBlend.usedPulseBlendPalettes) return;
  for (let i = 0; i < 16; i++) {
    const p = pulseBlend.pulseBlendPalettes[i]!;
    if (!p.available && p.inUse && (!gPaletteFade.active || !p.pulseBlendSettings.unk7_7)) {
      if (--p.delayCounter === -1 || p.delayCounter === 0xff) {
        p.delayCounter = p.pulseBlendSettings.delay;
        BlendPalette(p.pulseBlendSettings.paletteOffset, p.pulseBlendSettings.numColors, p.blendCoeff, p.pulseBlendSettings.blendColor);
        switch (p.pulseBlendSettings.fadeType) {
          case 0:
            if (p.blendCoeff++ === p.pulseBlendSettings.maxBlendCoeff) {
              p.fadeCycleCounter++;
              p.blendCoeff = 0;
            }
            break;
          case 1:
            if (p.fadeDirection) {
              if (--p.blendCoeff === 0) {
                p.fadeCycleCounter++;
                p.fadeDirection ^= 1;
              }
            } else {
              const max = (p.pulseBlendSettings.maxBlendCoeff - 1) & 0xf;
              if (p.blendCoeff++ === max) {
                p.fadeCycleCounter++;
                p.fadeDirection ^= 1;
              }
            }
            break;
          case 2:
            p.blendCoeff = p.fadeDirection ? 0 : (p.pulseBlendSettings.maxBlendCoeff & 0xf);
            p.fadeDirection ^= 1;
            p.fadeCycleCounter++;
            break;
        }
        if (p.pulseBlendSettings.numFadeCycles !== 0xff && p.fadeCycleCounter === p.pulseBlendSettings.numFadeCycles) {
          UnmarkUsedPulseBlendPalettes(pulseBlend, p.paletteSelector, 0);
        }
      }
    }
  }
}

export function FillTilemapRect(dest: Uint16Array, src: number, left: number, top: number, width: number, height: number): void {
  for (let i = 0; i < height; i++) {
    const row = (top + i) * 32 + left;
    for (let j = 0; j < width; j++) dest[row + j] = src;
  }
}

export function SetTilemapRect(dest: Uint16Array, src: Uint16Array, left: number, top: number, width: number, height: number): void {
  let srcIdx = 0;
  for (let i = 0; i < height; i++) {
    const row = (top + i) * 32 + left;
    for (let j = 0; j < width; j++) dest[row + j] = src[srcIdx++]!;
  }
}
