// battle_gfx_sfx_util.c: battler sprite graphics, healthbox loading, status/special animation launch,
// low HP music, enemy shadows. Also a few helpers the controllers import from here (sound.c wrappers,
// trainer pic tables, TryShinyAnimation from battle_anim_special.c).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import { cdata, incbin } from "../hw/assets";
import { templateFrom, type CSpriteTemplate } from "../hw/cdataSprite";
import { BG_PLTT_ID, BlendPalette, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP, RGB_WHITE } from "../hw/palette";
import { OBJ_VRAM0, ppu } from "../hw/ppu";
import {
  CreateSprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gSprites, LoadSpritePalette, LoadSpriteSheet, SpriteCallbackDummy, StartSpriteAffineAnim,
  StartSpriteAnim, ST_OAM_AFFINE_OFF, type Sprite,
} from "../hw/sprite";
import { GetMonData, gEnemyParty, playerMon, SetMonData, type Mon } from "../pokemon/mon";
import {
  DecompressPicFromTable, gEnemyMonElevation, GetMonFrontSpritePal, GetMonSpritePalFromSpeciesAndPersonality, gMonBackPicTable, gMonFrontPicTable,
  gTrainerBackPicCoords as trainerBackPicCoordsTable, gTrainerBackPicPaletteTable, gTrainerFrontPicCoords as trainerFrontPicCoordsTable,
  gTrainerFrontPicPaletteTable, gTrainerFrontPicTable, LoadSpecialPokePic, LoadSpecialPokePic_DontHandleDeoxys, symBytes, symPalette,
} from "../pokemon/pics";
import { b64, rom } from "../rom";
import {
  G, gBattleMonForms, gBattlerPartyIndexes, gBattlerPositions, gBattlerSpriteIds, gBattleSpritesDataPtr, gBattleStruct, gHealthboxSpriteIds,
  gMonSpritesGfxPtr, gTransformedPersonalities,
} from "./globals";
import {
  animState, ClearBattleAnimationVars, GetBattlerSpriteCoord, GetBattlerSpriteDefault_Y, GetSubstituteSpriteDefault_Y, IsBattlerSpritePresent,
  LaunchBattleAnimation, LaunchStatusAnimation,
} from "./anim";
import {
  CreateBattlerHealthboxSprites, CreateSafariPlayerHealthboxSprites, DummyBattleInterfaceFunc, GetHPBarLevel, InitBattlerHealthboxCoords,
  SetHealthboxSpriteInvisible, TryAddPokeballIconToHealthbox, UpdateHealthboxAttribute, UpdateNickInHealthbox,
} from "./interface";
import { SetIdleSpriteCallback } from "./main_init";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import { BufferBattlePartyCurrentOrder, GetPartyIdFromBattlePartyId } from "./ext";

export { ClearBattleAnimationVars, IsBattlerSpritePresent };
export { DoHitAnimHealthboxEffect } from "./pokeball";

const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);

// ---------------------------------------------------------------- sound.c wrappers

export function PlaySE12WithPanning(songNum: number, pan: number): void {
  sound.playSEWithPanning(songNum, pan);
}

export function PlayBGM(songNum: number): void {
  sound.playBGM(songNum);
}

// ---------------------------------------------------------------- trainer pic tables

export const gTrainerFrontPicCoords = (id: number) => trainerFrontPicCoordsTable()[id];
export const gTrainerBackPicCoords = (id: number) => trainerBackPicCoordsTable()[id];
export const gTrainerFrontPicTag = (id: number) => gTrainerFrontPicTable()[id].tag;
export const gTrainerFrontPicPaletteTag = (id: number) => gTrainerFrontPicPaletteTable()[id].tag;
/** gTrainerBackPicPaletteTable[index].data */
export const trainerBackPicPalette = (index: number) => symPalette(gTrainerBackPicPaletteTable()[index].data);

// ---------------------------------------------------------------- healthbox sheets

type Sheet = { sym: string; size: number; tag: number };
const sSpriteSheet_SinglesPlayerHealthbox: Sheet = { sym: "gHealthboxSinglesPlayerGfx", size: 0x1000, tag: C.TAG_HEALTHBOX_PLAYER1_TILE };
const sSpriteSheet_SinglesOpponentHealthbox: Sheet = { sym: "gHealthboxSinglesOpponentGfx", size: 0x1000, tag: C.TAG_HEALTHBOX_OPPONENT1_TILE };
const sSpriteSheets_DoublesPlayerHealthbox: Sheet[] = [
  { sym: "gHealthboxDoublesPlayerGfx", size: 0x800, tag: C.TAG_HEALTHBOX_PLAYER1_TILE },
  { sym: "gHealthboxDoublesPlayerGfx", size: 0x800, tag: C.TAG_HEALTHBOX_PLAYER2_TILE },
];
const sSpriteSheets_DoublesOpponentHealthbox: Sheet[] = [
  { sym: "gHealthboxDoublesOpponentGfx", size: 0x800, tag: C.TAG_HEALTHBOX_OPPONENT1_TILE },
  { sym: "gHealthboxDoublesOpponentGfx", size: 0x800, tag: C.TAG_HEALTHBOX_OPPONENT2_TILE },
];
const sSpriteSheet_SafariHealthbox: Sheet = { sym: "gHealthboxSafariGfx", size: 0x1000, tag: C.TAG_HEALTHBOX_SAFARI_TILE };
const sSpriteSheets_HealthBar: Sheet[] = [
  { sym: "", size: 0x100, tag: C.TAG_HEALTHBAR_PLAYER1_TILE },
  { sym: "", size: 0x120, tag: C.TAG_HEALTHBAR_OPPONENT1_TILE },
  { sym: "", size: 0x100, tag: C.TAG_HEALTHBAR_PLAYER2_TILE },
  { sym: "", size: 0x120, tag: C.TAG_HEALTHBAR_OPPONENT2_TILE },
];

/** LoadCompressedSpriteSheetUsingHeap: gBlankGfxCompressed decompresses to zeros. */
function loadSheet(sheet: Sheet): void {
  const data = sheet.sym ? incbin(sheet.sym).subarray(0, sheet.size) : new Uint8Array(sheet.size);
  LoadSpriteSheet({ data, size: sheet.size, tag: sheet.tag });
}

function pal16(sym: string): Uint16Array {
  const b = incbin(sym);
  return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~1)));
}

const sSpritePalettes_HealthBoxHealthBar = () => [
  { data: pal16("gBattleInterface_Healthbox_Pal"), tag: C.TAG_HEALTHBOX_PAL },
  { data: pal16("gBattleInterface_Healthbar_Pal"), tag: C.TAG_HEALTHBAR_PAL },
];

// ---------------------------------------------------------------- sprite callbacks

export function SpriteCB_WaitForBattlerBallReleaseAnim(sprite: Sprite): void {
  const s = gSprites[sprite.data[1]];
  if (!s.affineAnimEnded) return;
  if (s.invisible) return;
  if (s.animPaused) {
    s.animPaused = false;
  } else if (s.animEnded) {
    s.callback = SetIdleSpriteCallback;
    StartSpriteAffineAnim(s, 0);
    sprite.callback = SpriteCallbackDummy;
  }
}

// ---------------------------------------------------------------- animations

export function InitAndLaunchChosenStatusAnimation(isStatus2: number | boolean, status: number): void {
  const a = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[a];
  hb.statusAnimActive = 1;
  if (!isStatus2) {
    if (status === C.STATUS1_FREEZE) LaunchStatusAnimation(a, C.B_ANIM_STATUS_FRZ);
    else if (status === C.STATUS1_POISON || status & C.STATUS1_TOXIC_POISON) LaunchStatusAnimation(a, C.B_ANIM_STATUS_PSN);
    else if (status === C.STATUS1_BURN) LaunchStatusAnimation(a, C.B_ANIM_STATUS_BRN);
    else if (status & C.STATUS1_SLEEP) LaunchStatusAnimation(a, C.B_ANIM_STATUS_SLP);
    else if (status === C.STATUS1_PARALYSIS) LaunchStatusAnimation(a, C.B_ANIM_STATUS_PRZ);
    else hb.statusAnimActive = 0;
  } else {
    if (status & C.STATUS2_INFATUATION) LaunchStatusAnimation(a, C.B_ANIM_STATUS_INFATUATION);
    else if (status & C.STATUS2_CONFUSION) LaunchStatusAnimation(a, C.B_ANIM_STATUS_CONFUSION);
    else if (status & C.STATUS2_CURSED) LaunchStatusAnimation(a, C.B_ANIM_STATUS_CURSED);
    else if (status & C.STATUS2_NIGHTMARE) LaunchStatusAnimation(a, C.B_ANIM_STATUS_NIGHTMARE);
    else if (status & C.STATUS2_WRAPPED) LaunchStatusAnimation(a, C.B_ANIM_STATUS_WRAPPED);
    else hb.statusAnimActive = 0;
  }
}

export function TryHandleLaunchBattleTableAnimation(activeBattler: number, atkBattler: number, defBattler: number, tableId: number, argument: number): boolean {
  const data = gBattleSpritesDataPtr.battlerData[activeBattler];
  if (tableId === C.B_ANIM_CASTFORM_CHANGE && argument & 0x80) {
    gBattleMonForms[activeBattler] = argument & ~0x80;
    return true;
  }
  if (data.behindSubstitute && !ShouldAnimBeDoneRegardlessOfSubsitute(tableId)) return true;
  if (data.behindSubstitute && tableId === C.B_ANIM_SUBSTITUTE_FADE && gSprites[gBattlerSpriteIds[activeBattler]].invisible) {
    LoadBattleMonGfxAndAnimate(activeBattler, true, gBattlerSpriteIds[activeBattler]);
    ClearBehindSubstituteBit(activeBattler);
    return true;
  }
  animState.gBattleAnimAttacker = atkBattler;
  animState.gBattleAnimTarget = defBattler;
  gBattleSpritesDataPtr.animationData.animArg = argument;
  LaunchBattleAnimation("general", tableId, false);
  const taskId = tasks.create(Task_ClearBitWhenBattleTableAnimDone, 10);
  tasks.tasks[taskId].data[0] = activeBattler;
  gBattleSpritesDataPtr.healthBoxesData[activeBattler].animFromTableActive = 1;
  return false;
}

function Task_ClearBitWhenBattleTableAnimDone(taskId: number): void {
  animState.gAnimScriptCallback();
  if (!animState.gAnimScriptActive) {
    gBattleSpritesDataPtr.healthBoxesData[tasks.tasks[taskId].data[0]].animFromTableActive = 0;
    tasks.destroy(taskId);
  }
}

function ShouldAnimBeDoneRegardlessOfSubsitute(animId: number): boolean {
  switch (animId) {
    case C.B_ANIM_SUBSTITUTE_FADE:
    case C.B_ANIM_RAIN_CONTINUES:
    case C.B_ANIM_SUN_CONTINUES:
    case C.B_ANIM_SANDSTORM_CONTINUES:
    case C.B_ANIM_HAIL_CONTINUES:
    case C.B_ANIM_SNATCH_MOVE:
      return true;
    default:
      return false;
  }
}

export function InitAndLaunchSpecialAnimation(activeBattler: number, atkBattler: number, defBattler: number, tableId: number): void {
  animState.gBattleAnimAttacker = atkBattler;
  animState.gBattleAnimTarget = defBattler;
  LaunchBattleAnimation("special", tableId, false);
  const taskId = tasks.create(Task_ClearBitWhenSpecialAnimDone, 10);
  tasks.tasks[taskId].data[0] = activeBattler;
  gBattleSpritesDataPtr.healthBoxesData[activeBattler].specialAnimActive = 1;
}

function Task_ClearBitWhenSpecialAnimDone(taskId: number): void {
  animState.gAnimScriptCallback();
  if (!animState.gAnimScriptActive) {
    gBattleSpritesDataPtr.healthBoxesData[tasks.tasks[taskId].data[0]].specialAnimActive = 0;
    tasks.destroy(taskId);
  }
}

export function IsMoveWithoutAnimation(_moveId: number, _animationTurn: number): boolean {
  return false;
}

export function IsBattleSEPlaying(battlerId: number): boolean {
  const hb = gBattleSpritesDataPtr.healthBoxesData;
  if (sound.isSEPlaying()) {
    hb[battlerId].soundTimer++;
    // UB in the original: reads gActiveBattler instead of battlerId (always the same in practice).
    if (hb[G.gActiveBattler].soundTimer < 30) return true;
    sound.stopSE(0);
  }
  hb[battlerId].soundTimer = 0;
  return false;
}

// ---------------------------------------------------------------- battler sprite graphics

function loadMonPalette(battlerId: number, species: number, mon: Mon, otId: number, monsPersonality: number, palette: Uint16Array): void {
  let paletteOffset = OBJ_PLTT_ID(battlerId);
  LoadPalette(palette, paletteOffset, PLTT_SIZE_4BPP);
  LoadPalette(palette, BG_PLTT_ID(8) + BG_PLTT_ID(battlerId), PLTT_SIZE_4BPP);
  if (species === C.SPECIES_CASTFORM) {
    paletteOffset = OBJ_PLTT_ID(battlerId);
    castformPalette().set(palette.subarray(0, castformPalette().length));
    LoadPalette(castformForm(gBattleMonForms[battlerId]), paletteOffset, PLTT_SIZE_4BPP);
  }
  if (gBattleSpritesDataPtr.battlerData[battlerId].transformSpecies !== C.SPECIES_NONE) {
    BlendPalette(paletteOffset, 16, 6, RGB_WHITE);
    gPlttBufferUnfaded.set(gPlttBufferFaded.subarray(paletteOffset, paletteOffset + 16), paletteOffset);
  }
  void mon;
  void otId;
  void monsPersonality;
}

/** gBattleStruct->castformPalette: u16[NUM_CASTFORM_FORMS][16] */
function castformPalette(): Uint16Array {
  const raw = (gBattleStruct as unknown as { castformPalette: Uint8Array }).castformPalette;
  return new Uint16Array(raw.buffer, raw.byteOffset, raw.length >> 1);
}
function castformForm(form: number): Uint16Array {
  return castformPalette().subarray(form * 16, form * 16 + 16);
}

function spritePalette(battlerId: number, mon: Mon, species: number, otId: number, monsPersonality: number): Uint16Array {
  return gBattleSpritesDataPtr.battlerData[battlerId].transformSpecies === C.SPECIES_NONE
    ? GetMonFrontSpritePal(mon)
    : GetMonSpritePalFromSpeciesAndPersonality(species, otId, monsPersonality);
}

export function BattleLoadOpponentMonSpriteGfx(mon: Mon, battlerId: number): void {
  const monsPersonality = GetMonData(mon, C.MON_DATA_PERSONALITY);
  const info = gBattleSpritesDataPtr.battlerData[battlerId];
  const species = info.transformSpecies === C.SPECIES_NONE ? GetMonData(mon, C.MON_DATA_SPECIES) : info.transformSpecies;
  const currentPersonality = info.transformSpecies === C.SPECIES_NONE ? monsPersonality : gTransformedPersonalities[battlerId];
  const otId = GetMonData(mon, C.MON_DATA_OT_ID);
  const position = GetBattlerPosition(battlerId);
  LoadSpecialPokePic_DontHandleDeoxys(true, gMonSpritesGfxPtr.sprites[position], species, currentPersonality);
  loadMonPalette(battlerId, species, mon, otId, monsPersonality, spritePalette(battlerId, mon, species, otId, monsPersonality));
}

export function BattleLoadPlayerMonSpriteGfx(mon: Mon, battlerId: number): void {
  const monsPersonality = GetMonData(mon, C.MON_DATA_PERSONALITY);
  const info = gBattleSpritesDataPtr.battlerData[battlerId];
  const species = info.transformSpecies === C.SPECIES_NONE ? GetMonData(mon, C.MON_DATA_SPECIES) : info.transformSpecies;
  const currentPersonality = info.transformSpecies === C.SPECIES_NONE ? monsPersonality : gTransformedPersonalities[battlerId];
  const otId = GetMonData(mon, C.MON_DATA_OT_ID);
  const position = GetBattlerPosition(battlerId);
  // ShouldIgnoreDeoxysForm(DEOXYS_CHECK_BATTLE_SPRITE, battlerId) is TRUE outside of link battles in FRLG.
  if (ShouldIgnoreDeoxysForm(battlerId) || info.transformSpecies !== C.SPECIES_NONE) {
    LoadSpecialPokePic_DontHandleDeoxys(false, gMonSpritesGfxPtr.sprites[position], species, currentPersonality);
  } else {
    LoadSpecialPokePic(false, gMonSpritesGfxPtr.sprites[position], species, currentPersonality);
  }
  loadMonPalette(battlerId, species, mon, otId, monsPersonality, spritePalette(battlerId, mon, species, otId, monsPersonality));
}

/** pokemon.c ShouldIgnoreDeoxysForm, DEOXYS_CHECK_BATTLE_SPRITE case. */
function ShouldIgnoreDeoxysForm(battlerId: number): boolean {
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK)) return true;
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) return true;
  return false;
}

export function DecompressGhostFrontPic(_unused: Mon, battlerId: number): void {
  const position = GetBattlerPosition(battlerId);
  const pic = incbin("gGhostFrontPic");
  gMonSpritesGfxPtr.sprites[position].set(pic.subarray(0, gMonSpritesGfxPtr.sprites[position].length));
  const palOffset = OBJ_PLTT_ID(battlerId);
  const pal = pal16("gGhostPalette");
  LoadPalette(pal, palOffset, PLTT_SIZE_4BPP);
  LoadPalette(pal, BG_PLTT_ID(8) + BG_PLTT_ID(battlerId), PLTT_SIZE_4BPP);
}

export function DecompressTrainerFrontPic(frontPicId: number, battlerId: number): void {
  const position = GetBattlerPosition(battlerId);
  const sheet = gTrainerFrontPicTable()[frontPicId];
  DecompressPicFromTable(sheet, gMonSpritesGfxPtr.sprites[position], C.SPECIES_NONE);
  LoadSpriteSheet({ data: gMonSpritesGfxPtr.sprites[position].subarray(0, sheet.size), size: sheet.size, tag: sheet.tag });
  const pal = gTrainerFrontPicPaletteTable()[frontPicId];
  LoadSpritePalette({ data: symPalette(pal.data), tag: pal.tag });
}

export function DecompressTrainerBackPalette(index: number, palette: number): void {
  LoadPalette(symPalette(gTrainerBackPicPaletteTable()[index].data), OBJ_PLTT_ID(palette), PLTT_SIZE_4BPP);
}

export function FreeTrainerFrontPicPaletteAndTile(frontPicId: number): void {
  FreeSpritePaletteByTag(gTrainerFrontPicPaletteTable()[frontPicId].tag);
  FreeSpriteTilesByTag(gTrainerFrontPicTable()[frontPicId].tag);
}

export function BattleLoadAllHealthBoxesGfx(state: number): boolean {
  let retVal = false;
  if (!state) return false;
  if (state === 1) {
    const pals = sSpritePalettes_HealthBoxHealthBar();
    LoadSpritePalette(pals[0]);
    LoadSpritePalette(pals[1]);
  } else if (!IsDoubleBattle()) {
    if (state === 2) loadSheet(G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI ? sSpriteSheet_SafariHealthbox : sSpriteSheet_SinglesPlayerHealthbox);
    else if (state === 3) loadSheet(sSpriteSheet_SinglesOpponentHealthbox);
    else if (state === 4) loadSheet(sSpriteSheets_HealthBar[gBattlerPositions[0]]);
    else if (state === 5) loadSheet(sSpriteSheets_HealthBar[gBattlerPositions[1]]);
    else retVal = true;
  } else {
    if (state === 2) loadSheet(sSpriteSheets_DoublesPlayerHealthbox[0]);
    else if (state === 3) loadSheet(sSpriteSheets_DoublesPlayerHealthbox[1]);
    else if (state === 4) loadSheet(sSpriteSheets_DoublesOpponentHealthbox[0]);
    else if (state === 5) loadSheet(sSpriteSheets_DoublesOpponentHealthbox[1]);
    else if (state === 6) loadSheet(sSpriteSheets_HealthBar[gBattlerPositions[0]]);
    else if (state === 7) loadSheet(sSpriteSheets_HealthBar[gBattlerPositions[1]]);
    else if (state === 8) loadSheet(sSpriteSheets_HealthBar[gBattlerPositions[2]]);
    else if (state === 9) loadSheet(sSpriteSheets_HealthBar[gBattlerPositions[3]]);
    else retVal = true;
  }
  return retVal;
}

export function LoadBattleBarGfx(_arg0: number): void {
  const gfx = incbin("gInterfaceGfx_HPNumbers");
  gMonSpritesGfxPtr.barFontGfx.set(gfx.subarray(0, gMonSpritesGfxPtr.barFontGfx.length));
}

/** BattleInitAllSprites(u8 *state, u8 *battlerId): the pointers are passed as a small state object. */
export function BattleInitAllSprites(p: { state1: number; state2: number }): boolean {
  const st = { get state() { return p.state1; }, set state(v) { p.state1 = v; }, get battlerId() { return p.state2; }, set battlerId(v) { p.state2 = v; } };
  let retVal = false;
  switch (st.state) {
    case 0:
      ClearSpritesBattlerHealthboxAnimData();
      st.state++;
      break;
    case 1:
      if (!BattleLoadAllHealthBoxesGfx(st.battlerId)) {
        st.battlerId++;
      } else {
        st.battlerId = 0;
        st.state++;
      }
      break;
    case 2:
      st.state++;
      break;
    case 3:
      if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI && st.battlerId === 0) gHealthboxSpriteIds[st.battlerId] = CreateSafariPlayerHealthboxSprites();
      else gHealthboxSpriteIds[st.battlerId] = CreateBattlerHealthboxSprites(st.battlerId);
      if (++st.battlerId === G.gBattlersCount) {
        st.battlerId = 0;
        st.state++;
      }
      break;
    case 4:
      InitBattlerHealthboxCoords(st.battlerId);
      DummyBattleInterfaceFunc(gHealthboxSpriteIds[st.battlerId], gBattlerPositions[st.battlerId] > 1);
      if (++st.battlerId === G.gBattlersCount) {
        st.battlerId = 0;
        st.state++;
      }
      break;
    case 5:
      if (GetBattlerSide(st.battlerId) === C.B_SIDE_PLAYER) {
        if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI)) {
          UpdateHealthboxAttribute(gHealthboxSpriteIds[st.battlerId], playerMon(gBattlerPartyIndexes[st.battlerId]), C.HEALTHBOX_ALL);
        }
      } else {
        UpdateHealthboxAttribute(gHealthboxSpriteIds[st.battlerId], gEnemyParty[gBattlerPartyIndexes[st.battlerId]], C.HEALTHBOX_ALL);
      }
      SetHealthboxSpriteInvisible(gHealthboxSpriteIds[st.battlerId]);
      if (++st.battlerId === G.gBattlersCount) {
        st.battlerId = 0;
        st.state++;
      }
      break;
    case 6:
      LoadAndCreateEnemyShadowSprites();
      BufferBattlePartyCurrentOrder();
      retVal = true;
      break;
  }
  return retVal;
}

export function ClearSpritesHealthboxAnimData(): void {
  for (const hb of gBattleSpritesDataPtr.healthBoxesData) hb.bytes.fill(0);
  gBattleSpritesDataPtr.animationData.bytes.fill(0);
}

function ClearSpritesBattlerHealthboxAnimData(): void {
  ClearSpritesHealthboxAnimData();
  for (const d of gBattleSpritesDataPtr.battlerData) d.bytes.fill(0);
}

export function CopyAllBattleSpritesInvisibilities(): void {
  for (let i = 0; i < G.gBattlersCount; i++) gBattleSpritesDataPtr.battlerData[i].invisible = gSprites[gBattlerSpriteIds[i]].invisible ? 1 : 0;
}

export function CopyBattleSpriteInvisibility(battlerId: number): void {
  gBattleSpritesDataPtr.battlerData[battlerId].invisible = gSprites[gBattlerSpriteIds[battlerId]].invisible ? 1 : 0;
}

export function HandleSpeciesGfxDataChange(battlerAtk: number, battlerDef: number, transformType: number): void {
  const atkSprite = gSprites[gBattlerSpriteIds[battlerAtk]];
  if (transformType === 255) {
    // Ghost unveiled with the Silph Scope
    const position = GetBattlerPosition(battlerAtk);
    const mon = gEnemyParty[gBattlerPartyIndexes[battlerAtk]];
    const targetSpecies = GetMonData(mon, C.MON_DATA_SPECIES);
    const personalityValue = GetMonData(mon, C.MON_DATA_PERSONALITY);
    const otId = GetMonData(mon, C.MON_DATA_OT_ID);
    LoadSpecialPokePic_DontHandleDeoxys(true, gMonSpritesGfxPtr.sprites[position], targetSpecies, personalityValue);
    ppu.vram.set(gMonSpritesGfxPtr.sprites[position].subarray(0, 0x800), OBJ_VRAM0 + atkSprite.oam.tileNum * 32);
    LoadPalette(GetMonSpritePalFromSpeciesAndPersonality(targetSpecies, otId, personalityValue), OBJ_PLTT_ID(battlerAtk), PLTT_SIZE_4BPP);
    atkSprite.y = GetBattlerSpriteDefault_Y(battlerAtk);
    StartSpriteAnim(atkSprite, gBattleMonForms[battlerAtk]);
    SetMonData(mon, C.MON_DATA_NICKNAME, b64(rom.species[targetSpecies].name));
    UpdateNickInHealthbox(gHealthboxSpriteIds[battlerAtk], mon);
    TryAddPokeballIconToHealthbox(gHealthboxSpriteIds[battlerAtk], true);
  } else if (transformType) {
    // Castform form change
    const form = gBattleSpritesDataPtr.animationData.animArg;
    StartSpriteAnim(atkSprite, form);
    const paletteOffset = OBJ_PLTT_ID(battlerAtk);
    LoadPalette(castformForm(form), paletteOffset, PLTT_SIZE_4BPP);
    gBattleMonForms[battlerAtk] = form;
    if (gBattleSpritesDataPtr.battlerData[battlerAtk].transformSpecies !== C.SPECIES_NONE) {
      BlendPalette(paletteOffset, 16, 6, RGB_WHITE);
      gPlttBufferUnfaded.set(gPlttBufferFaded.subarray(paletteOffset, paletteOffset + 16), paletteOffset);
    }
    atkSprite.y = GetBattlerSpriteDefault_Y(battlerAtk);
  } else {
    // Transform move
    const position = GetBattlerPosition(battlerAtk);
    const defMon = GetBattlerSide(battlerDef) === C.B_SIDE_OPPONENT ? gEnemyParty[gBattlerPartyIndexes[battlerDef]] : playerMon(gBattlerPartyIndexes[battlerDef]);
    const targetSpecies = GetMonData(defMon, C.MON_DATA_SPECIES);
    const atkMon = GetBattlerSide(battlerAtk) === C.B_SIDE_PLAYER ? playerMon(gBattlerPartyIndexes[battlerAtk]) : gEnemyParty[gBattlerPartyIndexes[battlerAtk]];
    const personalityValue = GetMonData(atkMon, C.MON_DATA_PERSONALITY);
    const otId = GetMonData(atkMon, C.MON_DATA_OT_ID);
    LoadSpecialPokePic_DontHandleDeoxys(GetBattlerSide(battlerAtk) !== C.B_SIDE_PLAYER, gMonSpritesGfxPtr.sprites[position], targetSpecies, gTransformedPersonalities[battlerAtk]);
    ppu.vram.set(gMonSpritesGfxPtr.sprites[position].subarray(0, 0x800), OBJ_VRAM0 + atkSprite.oam.tileNum * 32);
    const paletteOffset = OBJ_PLTT_ID(battlerAtk);
    const pal = GetMonSpritePalFromSpeciesAndPersonality(targetSpecies, otId, personalityValue);
    LoadPalette(pal, paletteOffset, PLTT_SIZE_4BPP);
    if (targetSpecies === C.SPECIES_CASTFORM) {
      castformPalette().set(pal.subarray(0, castformPalette().length));
      LoadPalette(castformForm(gBattleMonForms[battlerDef]), paletteOffset, PLTT_SIZE_4BPP);
    }
    BlendPalette(paletteOffset, 16, 6, RGB_WHITE);
    gPlttBufferUnfaded.set(gPlttBufferFaded.subarray(paletteOffset, paletteOffset + 16), paletteOffset);
    gBattleSpritesDataPtr.battlerData[battlerAtk].transformSpecies = targetSpecies;
    gBattleMonForms[battlerAtk] = gBattleMonForms[battlerDef];
    atkSprite.y = GetBattlerSpriteDefault_Y(battlerAtk);
    StartSpriteAnim(atkSprite, gBattleMonForms[battlerAtk]);
  }
}

export function BattleLoadSubstituteOrMonSpriteGfx(battlerId: number, loadMonSprite: boolean): void {
  if (!loadMonSprite) {
    const position = GetBattlerPosition(battlerId);
    const buf = gMonSpritesGfxPtr.sprites[position];
    const doll = incbin(GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER ? "gSubstituteDollFrontGfx" : "gSubstituteDollBackGfx");
    buf.set(doll.subarray(0, 0x800));
    for (let i = 1; i < 4; i++) buf.copyWithin(i * 0x800, 0, 0x800);
    LoadPalette(pal16("gSubstituteDollPal"), OBJ_PLTT_ID(battlerId), PLTT_SIZE_4BPP);
  } else if (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER) {
    BattleLoadOpponentMonSpriteGfx(gEnemyParty[gBattlerPartyIndexes[battlerId]], battlerId);
  } else {
    BattleLoadPlayerMonSpriteGfx(playerMon(gBattlerPartyIndexes[battlerId]), battlerId);
  }
}

export function LoadBattleMonGfxAndAnimate(battlerId: number, loadMonSprite: boolean, spriteId: number): void {
  BattleLoadSubstituteOrMonSpriteGfx(battlerId, loadMonSprite);
  StartSpriteAnim(gSprites[spriteId], gBattleMonForms[battlerId]);
  gSprites[spriteId].y = loadMonSprite ? GetBattlerSpriteDefault_Y(battlerId) : GetSubstituteSpriteDefault_Y(battlerId);
}

export function TrySetBehindSubstituteSpriteBit(battlerId: number, move: number): void {
  if (move === C.MOVE_SUBSTITUTE) gBattleSpritesDataPtr.battlerData[battlerId].behindSubstitute = 1;
}

export function ClearBehindSubstituteBit(battlerId: number): void {
  gBattleSpritesDataPtr.battlerData[battlerId].behindSubstitute = 0;
}

export function HandleLowHpMusicChange(mon: Mon, battlerId: number): void {
  const hp = GetMonData(mon, C.MON_DATA_HP);
  const maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
  const data = gBattleSpritesDataPtr.battlerData;
  if (GetHPBarLevel(hp, maxHP) === C.HP_BAR_RED) {
    if (!data[battlerId].lowHpSong) {
      if (!data[battlerId ^ C.BIT_FLANK].lowHpSong) sound.playSE(C.SE_LOW_HEALTH);
      data[battlerId].lowHpSong = 1;
    }
  } else {
    data[battlerId].lowHpSong = 0;
    if (!IsDoubleBattle()) sound.stopSE(C.SE_LOW_HEALTH);
    else if (!data[battlerId ^ C.BIT_FLANK].lowHpSong) sound.stopSE(C.SE_LOW_HEALTH);
  }
}

export function BattleStopLowHpSound(): void {
  const playerBattler = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
  gBattleSpritesDataPtr.battlerData[playerBattler].lowHpSong = 0;
  if (IsDoubleBattle()) gBattleSpritesDataPtr.battlerData[playerBattler ^ C.BIT_FLANK].lowHpSong = 0;
  sound.stopSE(C.SE_LOW_HEALTH);
}

export function HandleBattleLowHpMusicChange(): void {
  if (!(G as unknown as { inBattle?: boolean }).inBattle && !gBattleStruct) return;
  const b1 = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
  const b2 = GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT);
  const p1 = GetPartyIdFromBattlePartyId(gBattlerPartyIndexes[b1]);
  const p2 = GetPartyIdFromBattlePartyId(gBattlerPartyIndexes[b2]);
  if (GetMonData(playerMon(p1), C.MON_DATA_HP) !== 0) HandleLowHpMusicChange(playerMon(p1), b1);
  if (IsDoubleBattle() && GetMonData(playerMon(p2), C.MON_DATA_HP) !== 0) HandleLowHpMusicChange(playerMon(p2), b2);
}

export function SetBattlerSpriteAffineMode(affineMode: number): void {
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (!IsBattlerSpritePresent(i)) continue;
    const s = gSprites[gBattlerSpriteIds[i]];
    s.oam.affineMode = affineMode;
    if (affineMode === ST_OAM_AFFINE_OFF) {
      gBattleSpritesDataPtr.healthBoxesData[i].matrixNum = s.oam.matrixNum;
      s.oam.matrixNum = 0;
    } else {
      s.oam.matrixNum = gBattleSpritesDataPtr.healthBoxesData[i].matrixNum;
    }
  }
}

export function LoadAndCreateEnemyShadowSprites(): void {
  const sheet = cdata<{ data: unknown; size: number; tag: number }>("battle_anim_smokescreen", "gSpriteSheet_EnemyShadow");
  LoadSpriteSheet({ data: symBytes(sheet.data).subarray(0, sheet.size), size: sheet.size, tag: sheet.tag });
  const template = templateFrom(cdata<CSpriteTemplate>("battle_anim_smokescreen", "gSpriteTemplate_EnemyShadow"), { SpriteCB_SetInvisible });
  const create = (battlerId: number) => {
    const id = CreateSprite(template, GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_X), GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y) + 29, 0xc8);
    gBattleSpritesDataPtr.healthBoxesData[battlerId].shadowSpriteId = id;
    gSprites[id].data[0] = battlerId;
  };
  create(GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT));
  if (IsDoubleBattle()) create(GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT));
}

function SpriteCB_EnemyShadow(shadowSprite: Sprite): void {
  let invisible = false;
  const battlerId = shadowSprite.data[0];
  const battlerSprite = gSprites[gBattlerSpriteIds[battlerId]];
  if (!battlerSprite.inUse || !IsBattlerSpritePresent(battlerId)) {
    shadowSprite.callback = SpriteCB_SetInvisible;
    return;
  }
  const data = gBattleSpritesDataPtr.battlerData[battlerId];
  if (animState.gAnimScriptActive || battlerSprite.invisible) invisible = true;
  else if (data.transformSpecies !== C.SPECIES_NONE && gEnemyMonElevation(data.transformSpecies) === 0) invisible = true;
  if (data.behindSubstitute) invisible = true;
  shadowSprite.x = battlerSprite.x;
  shadowSprite.x2 = battlerSprite.x2;
  shadowSprite.invisible = invisible;
}

export function SpriteCB_SetInvisible(sprite: Sprite): void {
  sprite.invisible = true;
}

export function SetBattlerShadowSpriteCallback(battlerId: number, species: number): void {
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) return; // the player's shadow is never seen
  const data = gBattleSpritesDataPtr.battlerData[battlerId];
  if (data.transformSpecies !== C.SPECIES_NONE) species = data.transformSpecies;
  const shadow = gSprites[gBattleSpritesDataPtr.healthBoxesData[battlerId].shadowSpriteId];
  shadow.callback = gEnemyMonElevation(species) !== 0 ? SpriteCB_EnemyShadow : SpriteCB_SetInvisible;
}

export function HideBattlerShadowSprite(battlerId: number): void {
  gSprites[gBattleSpritesDataPtr.healthBoxesData[battlerId].shadowSpriteId].callback = SpriteCB_SetInvisible;
}

export function ClearTemporarySpeciesSpriteData(battlerId: number, dontClearSubstitute: boolean | number): void {
  gBattleSpritesDataPtr.battlerData[battlerId].transformSpecies = C.SPECIES_NONE;
  gBattleMonForms[battlerId] = 0;
  if (!dontClearSubstitute) ClearBehindSubstituteBit(battlerId);
}

/** pokemon.c ClearBattleMonForms */
export function ClearBattleMonForms(): void {
  gBattleMonForms.fill(0);
}

export function ShouldPlayNormalMonCry(mon: Mon): boolean {
  if (GetMonData(mon, C.MON_DATA_STATUS) & (C.STATUS1_ANY | C.STATUS1_TOXIC_COUNTER)) return false;
  const hp = GetMonData(mon, C.MON_DATA_HP);
  const maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
  return GetHPBarLevel(hp, maxHP) > C.HP_BAR_YELLOW;
}

export { TryShinyAnimation } from "./anims/special";

