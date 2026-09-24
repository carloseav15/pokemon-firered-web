// reshow_battle_screen.c: rebuilds the battle screen after returning from the bag / party / summary menus.
// (The help-system context and wireless indicator are not part of the port.)

import * as C from "../generated/constants";
import { BG_ATTR_CHARBASEINDEX, SetBgAttribute, ShowBg } from "../hw/bg";
import { SetGpuReg, SetGpuRegBits } from "../hw/gpu";
import { BeginHardwarePaletteFade, gPaletteFade, ResetPaletteFade } from "../hw/palette";
import {
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_OBJWIN_ON, DISPCNT_WIN0_ON, ppu, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT,
  REG_OFFSET_MOSAIC, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WIN1H, REG_OFFSET_WIN1V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
} from "../hw/ppu";
import { SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "../hw/runtime";
import { ScanlineEffect_Clear } from "../hw/scanline";
import { CreateSprite, FreeAllSpritePalettes, gSprites, ResetSpriteData, SpriteCallbackDummy, spriteState, StartSpriteAnim } from "../hw/sprite";
import { GetMonData, gEnemyParty, playerMon } from "../pokemon/mon";
import { save } from "../save";
import { G, gActionSelectionCursor, gBattleMonForms, gBattlerPartyIndexes, gBattlerSpriteIds, gBattleScripting, gBattleSpritesDataPtr, gHealthboxSpriteIds } from "./globals";
import { IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE } from "./macros";
import { BattleInitBgsAndWindows, BattleInterfaceSetWindowPals, LoadBattleTextboxAndBackground } from "./bg";
import {
  BattleLoadAllHealthBoxesGfx, BattleLoadOpponentMonSpriteGfx, BattleLoadPlayerMonSpriteGfx, BattleLoadSubstituteOrMonSpriteGfx, ClearSpritesHealthboxAnimData,
  DecompressGhostFrontPic, DecompressTrainerBackPalette, gTrainerBackPicCoords, LoadAndCreateEnemyShadowSprites, SetBattlerShadowSpriteCallback,
} from "./gfx_sfx_util";
import {
  GetBattlerSpriteCoord, GetBattlerSpriteDefault_Y, GetBattlerSpriteSubpriority, GetGhostSpriteDefault_Y, GetSubstituteSpriteDefault_Y, gMultiuseSpriteTemplate,
  SetMultiuseSpriteTemplateToPokemon, SetMultiuseSpriteTemplateToTrainerBack,
} from "./anim";
import {
  CreateBattlerHealthboxSprites, CreateSafariPlayerHealthboxSprites, DummyBattleInterfaceFunc, InitBattlerHealthboxCoords, SetHealthboxSpriteInvisible,
  SetHealthboxSpriteVisible, UpdateHealthboxAttribute,
} from "./interface";
import { ActionSelectionCreateCursorAt } from "./controller_player";
import { BattleMainCB2, VBlankCB_Battle } from "./main_init";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";

const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);

export function ReshowBattleScreenDummy(): void {}

export function ReshowBattleScreenAfterMenu(): void {
  gPaletteFade.bufferTransferDisabled = true;
  SetHBlankCallback(null);
  SetGpuReg(REG_OFFSET_MOSAIC, 0);
  gBattleScripting.reshowMainState = 0;
  gBattleScripting.reshowHelperState = 0;
  SetMainCallback2(CB2_ReshowBattleScreenAfterMenu);
}

function CB2_ReshowBattleScreenAfterMenu(): void {
  const s = gBattleScripting;
  switch (s.reshowMainState) {
    case 0:
      ResetSpriteData();
      break;
    case 1:
      SetVBlankCallback(null);
      ScanlineEffect_Clear();
      BattleInitBgsAndWindows();
      SetBgAttribute(1, BG_ATTR_CHARBASEINDEX, 0);
      SetBgAttribute(2, BG_ATTR_CHARBASEINDEX, 0);
      for (let bg = 0; bg < 4; bg++) ShowBg(bg);
      ResetPaletteFade();
      G.gBattle_BG0_X = G.gBattle_BG0_Y = 0;
      G.gBattle_BG1_X = G.gBattle_BG1_Y = 0;
      G.gBattle_BG2_X = G.gBattle_BG2_Y = 0;
      G.gBattle_BG3_X = G.gBattle_BG3_Y = 0;
      break;
    case 2:
      ppu.vram.fill(0);
      break;
    case 3:
      LoadBattleTextboxAndBackground();
      break;
    case 4:
      FreeAllSpritePalettes();
      spriteState.gReservedSpritePaletteCount = 4;
      break;
    case 5:
      ClearSpritesHealthboxAnimData();
      break;
    case 6:
      if (BattleLoadAllHealthBoxesGfx(s.reshowHelperState)) {
        s.reshowHelperState = 0;
      } else {
        s.reshowHelperState++;
        s.reshowMainState--;
      }
      break;
    case 7: case 8: case 9: case 10:
      if (!LoadBattlerSpriteGfx(s.reshowMainState - 7)) s.reshowMainState--;
      break;
    case 11: case 12: case 13: case 14:
      CreateBattlerSprite(s.reshowMainState - 11);
      break;
    case 15: case 16: case 17: case 18:
      CreateHealthboxSprite(s.reshowMainState - 15);
      break;
    case 19: {
      LoadAndCreateEnemyShadowSprites();
      let opponentBattler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
      SetBattlerShadowSpriteCallback(opponentBattler, GetMonData(gEnemyParty[gBattlerPartyIndexes[opponentBattler]], C.MON_DATA_SPECIES));
      if (IsDoubleBattle()) {
        opponentBattler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT);
        SetBattlerShadowSpriteCallback(opponentBattler, GetMonData(gEnemyParty[gBattlerPartyIndexes[opponentBattler]], C.MON_DATA_SPECIES));
      }
      ActionSelectionCreateCursorAt(gActionSelectionCursor[G.gBattlerInMenuId], 0);
      break;
    }
    case 20:
      SetVBlankCallback(VBlankCB_Battle);
      ReshowBattleScreen_TurnOnDisplay();
      BeginHardwarePaletteFade(0xff, 0, 0x10, 0, 1);
      gPaletteFade.bufferTransferDisabled = false;
      SetMainCallback2(BattleMainCB2);
      BattleInterfaceSetWindowPals();
      break;
  }
  s.reshowMainState++;
}

function ReshowBattleScreen_TurnOnDisplay(): void {
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetGpuReg(REG_OFFSET_WININ, 0x3f);
  SetGpuReg(REG_OFFSET_WINOUT, 0x3f);
  SetGpuReg(REG_OFFSET_WIN0H, 0);
  SetGpuReg(REG_OFFSET_WIN0V, 0);
  SetGpuReg(REG_OFFSET_WIN1H, 0);
  SetGpuReg(REG_OFFSET_WIN1V, 0);
  SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON | DISPCNT_WIN0_ON | DISPCNT_OBJWIN_ON);
}

function LoadBattlerSpriteGfx(battler: number): boolean {
  if (battler < G.gBattlersCount) {
    const data = gBattleSpritesDataPtr.battlerData[battler];
    if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) {
      const mon = gEnemyParty[gBattlerPartyIndexes[battler]];
      if (IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(G.gBattleTypeFlags)) DecompressGhostFrontPic(mon, battler);
      else if (!data.behindSubstitute) BattleLoadOpponentMonSpriteGfx(mon, battler);
      else BattleLoadSubstituteOrMonSpriteGfx(battler, false);
    } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI && battler === C.B_POSITION_PLAYER_LEFT) {
      DecompressTrainerBackPalette(save.playerGender, battler); // checks the battler, not the position (as in the original)
    } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_OLD_MAN_TUTORIAL && battler === C.B_POSITION_PLAYER_LEFT) {
      DecompressTrainerBackPalette(C.TRAINER_BACK_PIC_OLD_MAN, battler);
    } else if (!data.behindSubstitute) {
      BattleLoadPlayerMonSpriteGfx(playerMon(gBattlerPartyIndexes[battler]), battler);
    } else {
      BattleLoadSubstituteOrMonSpriteGfx(battler, false);
    }
    gBattleScripting.reshowHelperState = 0;
  }
  return true;
}

function CreateBattlerSprite(battler: number): void {
  if (battler >= G.gBattlersCount) return;
  let posY: number;
  if (IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(G.gBattleTypeFlags)) posY = GetGhostSpriteDefault_Y(battler);
  else if (gBattleSpritesDataPtr.battlerData[battler].behindSubstitute) posY = GetSubstituteSpriteDefault_Y(battler);
  else posY = GetBattlerSpriteDefault_Y(battler);

  const setup = (withSpecies: number | null) => {
    const s = gSprites[gBattlerSpriteIds[battler]];
    s.oam.paletteNum = battler;
    s.callback = SpriteCallbackDummy;
    s.data[0] = battler;
    if (withSpecies !== null) {
      s.data[2] = withSpecies;
      StartSpriteAnim(s, gBattleMonForms[battler]);
    }
  };

  if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) {
    const mon = gEnemyParty[gBattlerPartyIndexes[battler]];
    if (GetMonData(mon, C.MON_DATA_HP) === 0) return;
    const species = GetMonData(mon, C.MON_DATA_SPECIES);
    SetMultiuseSpriteTemplateToPokemon(species, GetBattlerPosition(battler));
    gBattlerSpriteIds[battler] = CreateSprite(gMultiuseSpriteTemplate(), GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2), posY, GetBattlerSpriteSubpriority(battler));
    setup(species);
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI && battler === C.B_POSITION_PLAYER_LEFT) {
    SetMultiuseSpriteTemplateToTrainerBack(save.playerGender, GetBattlerPosition(C.B_POSITION_PLAYER_LEFT));
    gBattlerSpriteIds[battler] = CreateSprite(gMultiuseSpriteTemplate(), 0x50, (8 - gTrainerBackPicCoords(save.playerGender).size) * 4 + 80, GetBattlerSpriteSubpriority(0));
    setup(null);
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_OLD_MAN_TUTORIAL && battler === C.B_POSITION_PLAYER_LEFT) {
    SetMultiuseSpriteTemplateToTrainerBack(5, GetBattlerPosition(0));
    gBattlerSpriteIds[battler] = CreateSprite(gMultiuseSpriteTemplate(), 0x50, (8 - gTrainerBackPicCoords(5).size) * 4 + 80, GetBattlerSpriteSubpriority(0));
    setup(null);
  } else {
    const mon = playerMon(gBattlerPartyIndexes[battler]);
    if (GetMonData(mon, C.MON_DATA_HP) === 0) return;
    const species = GetMonData(mon, C.MON_DATA_SPECIES);
    SetMultiuseSpriteTemplateToPokemon(species, GetBattlerPosition(battler));
    gBattlerSpriteIds[battler] = CreateSprite(gMultiuseSpriteTemplate(), GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2), posY, GetBattlerSpriteSubpriority(battler));
    setup(species);
  }
  gSprites[gBattlerSpriteIds[battler]].invisible = !!gBattleSpritesDataPtr.battlerData[battler].invisible;
}

function CreateHealthboxSprite(battler: number): void {
  if (battler >= G.gBattlersCount) return;
  let healthboxSpriteId: number;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI && battler === C.B_POSITION_PLAYER_LEFT) healthboxSpriteId = CreateSafariPlayerHealthboxSprites();
  else if (G.gBattleTypeFlags & C.BATTLE_TYPE_OLD_MAN_TUTORIAL && battler === C.B_POSITION_PLAYER_LEFT) return;
  else healthboxSpriteId = CreateBattlerHealthboxSprites(battler);
  gHealthboxSpriteIds[battler] = healthboxSpriteId;
  InitBattlerHealthboxCoords(battler);
  SetHealthboxSpriteVisible(healthboxSpriteId);
  if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) UpdateHealthboxAttribute(healthboxSpriteId, gEnemyParty[gBattlerPartyIndexes[battler]], C.HEALTHBOX_ALL);
  else if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) UpdateHealthboxAttribute(healthboxSpriteId, playerMon(gBattlerPartyIndexes[battler]), C.HEALTHBOX_SAFARI_ALL_TEXT);
  else UpdateHealthboxAttribute(healthboxSpriteId, playerMon(gBattlerPartyIndexes[battler]), C.HEALTHBOX_ALL);
  const pos = GetBattlerPosition(battler);
  DummyBattleInterfaceFunc(healthboxSpriteId, pos === C.B_POSITION_OPPONENT_RIGHT || pos === C.B_POSITION_PLAYER_RIGHT);
  if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) {
    if (GetMonData(gEnemyParty[gBattlerPartyIndexes[battler]], C.MON_DATA_HP) === 0) SetHealthboxSpriteInvisible(healthboxSpriteId);
  } else if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) && GetMonData(playerMon(gBattlerPartyIndexes[battler]), C.MON_DATA_HP) === 0) {
    SetHealthboxSpriteInvisible(healthboxSpriteId);
  }
}
