// bg_regs.c: shared register offsets and per-background display/blend masks.
import * as C from "../generated/constants";

/** Register offsets corresponding to gBGControlRegs in the GBA MMIO table. */
export const gBGControlRegs = [C.REG_OFFSET_BG0CNT, C.REG_OFFSET_BG1CNT, C.REG_OFFSET_BG2CNT, C.REG_OFFSET_BG3CNT] as const;
export const gBGHOffsetRegs = [C.REG_OFFSET_BG0HOFS, C.REG_OFFSET_BG1HOFS, C.REG_OFFSET_BG2HOFS, C.REG_OFFSET_BG3HOFS] as const;
export const gBGVOffsetRegs = [C.REG_OFFSET_BG0VOFS, C.REG_OFFSET_BG1VOFS, C.REG_OFFSET_BG2VOFS, C.REG_OFFSET_BG3VOFS] as const;

export const gDISPCNTBGFlags = [C.DISPCNT_BG0_ON, C.DISPCNT_BG1_ON, C.DISPCNT_BG2_ON, C.DISPCNT_BG3_ON] as const;
export const gOverworldBackgroundLayerFlags = [C.BLDCNT_TGT2_BG0, C.BLDCNT_TGT2_BG1, C.BLDCNT_TGT2_BG2, C.BLDCNT_TGT2_BG3] as const;
export const gBLDCNTTarget1BGFlags = [C.BLDCNT_TGT1_BG0, C.BLDCNT_TGT1_BG1, C.BLDCNT_TGT1_BG2, C.BLDCNT_TGT1_BG3] as const;

export const gBGControlRegOffsets = gBGControlRegs;
export const gBGHOffsetRegOffsets = gBGHOffsetRegs;
export const gBGVOffsetRegOffsets = gBGVOffsetRegs;
