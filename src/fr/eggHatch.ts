// daycare.c: the egg hatching scene (EggHatch, CB2_EggHatch_0/1, the egg and shard sprites, the nickname prompt).
import { sound } from "./audio/sound";
import * as C from "./generated/constants";
import { expandPlaceholders, stringVars } from "./gba/charmap";
import { FONT_NORMAL_COPY_2 } from "./gba/font";
import { tasks } from "./gba/tasks";
import { HelpSystem_Disable, HelpSystem_Enable } from "./helpSystem";
import { cdata, incbin, incbin16, loadCData, preloadIncbin } from "./hw/assets";
import {
  type BgTemplate, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, InitBgsFromTemplates, LoadBgTiles,
  ResetBgsAndClearDma3BusyFlags, SetBgAttribute, SetBgTilemapBuffer, ShowBg, UnsetBgTilemapBuffer,
} from "./hw/bg";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import { SetGpuReg } from "./hw/gpu";
import { CreateYesNoMenu, LoadUserWindowGfx2, Menu_ProcessInputNoWrapClearOnChoose } from "./hw/menu";
import { DecompressAndLoadBgGfxUsingHeap } from "./hw/menuHelpers";
import { BeginNormalPaletteFade, gPaletteFade, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { HwScene, SetMainCallback2, SetVBlankCallback, gMain } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, LoadOam, LoadSpritePalette, LoadSpriteSheet,
  ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy, StartSpriteAffineAnim, StartSpriteAnim, gSprites,
  type Sprite,
} from "./hw/sprite";
import { AddTextPrinterParameterized4, DeactivateAllTextPrinters, IsTextPrinterActive, RunTextPrinters } from "./hw/text";
import { Sin } from "./hw/trig";
import {
  CopyWindowToVram, FillWindowPixelBuffer, InitWindows, PutWindowTilemap, RemoveWindow, COPYWIN_FULL, type WindowTemplate,
} from "./hw/window";
import { AllocateMonSpritesGfx, FreeMonSpritesGfx, gMonSpritesGfxPtr } from "./battle/globals";
import { gMultiuseSpriteTemplate, SetMultiuseSpriteTemplateToPokemon } from "./battle/anim";
import { DoNamingScreen } from "./namingScreen";
import { GetMonGender, playerMon } from "./pokemon/mon";
import { AddHatchedMonToParty } from "./pokemon/daycare";
import { gMonFrontPicCoords, LoadSpecialPokePic } from "./pokemon/pics";
import { random } from "./random";
import { rom } from "./rom";
import { save, SV, varGet, varSet } from "./save";
import { GetMonSpritePalStructFromOtIdPersonality } from "./trainerPokemonSprites";
import type { Game } from "./game";

const symbols = [
  "daycare.c:sEggHatchTiles", "daycare.c:sEggPalette", "daycare.c:sEggShardTiles",
  "gBattleInterface_Textbox_Gfx", "gBattleInterface_Textbox_Tilemap", "gBattleInterface_Textbox_Pal",
  "gTradeGba2_Pal", "gTradeGba_Gfx", "gTradeOrHatchMonShadowTilemap",
];

/** Loads the hatching scene's INCBIN packs and cdata tables. */
export async function preloadEggHatch(): Promise<void> {
  await Promise.all([preloadIncbin(symbols), loadCData("daycare", "pokemon", "data")]);
}

const BG_PLTT_ID = (n: number): number => n * 16;
const PLTT_SIZE_4BPP = 32;

/** struct EggHatchData. */
type EggHatchData = {
  eggSpriteID: number;
  pokeSpriteID: number;
  CB2_state: number;
  CB2_PalCounter: number;
  eggPartyID: number;
  windowId: number;
  eggShardVelocityID: number;
  species: number;
  textColor: number[];
};

let sEggHatchData: EggHatchData | null = null;
let sGame: Game | null = null;
let sScene: HwScene | null = null;

function dc<T>(name: string): T {
  return cdata<T>("daycare", name);
}

function eggTemplate(name: string): ReturnType<typeof templateFrom> {
  return templateFrom(dc<CSpriteTemplate>(name), {});
}

/** EggHatchCreateMonSprite (daycare.c). */
function EggHatchCreateMonSprite(a0: number, switchID: number, pokeID: number): { spriteId: number; species: number } {
  let r4 = 0;
  let spriteID = 0;
  let species = 0;
  const mon = playerMon(pokeID);
  if (a0 === 0) r4 = 1;
  if (a0 === 1) r4 = 3;
  switch (switchID) {
    case 0: {
      species = mon.species;
      LoadSpecialPokePic(true, gMonSpritesGfxPtr.sprites[a0 * 2 + 1], species, mon.personality);
      LoadSpritePalette(GetMonSpritePalStructFromOtIdPersonality(species, mon.otId, mon.personality));
      break;
    }
    case 1: {
      const pal = GetMonSpritePalStructFromOtIdPersonality(mon.species, mon.otId, mon.personality);
      SetMultiuseSpriteTemplateToPokemon(pal.tag, r4);
      spriteID = CreateSprite(gMultiuseSpriteTemplate(), 120, 70, 6);
      gSprites[spriteID].invisible = true;
      gSprites[spriteID].callback = SpriteCallbackDummy;
      break;
    }
  }
  return { spriteId: spriteID, species };
}

/** VBlankCB_EggHatch (daycare.c). */
function VBlankCB_EggHatch(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

/** EggHatch (daycare.c): fade the field out with Task_EggHatch, then switch to the hatching callbacks. */
export function EggHatch(game: Game): void {
  sGame = game;
  game.overworld.LockPlayerFieldControls();
  const scene = new HwScene();
  scene.enter();
  sScene = scene;
  game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  tasks.create(Task_EggHatch, 10);
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, 0);
  HelpSystem_Disable();
}

/** Task_EggHatch (daycare.c). */
function Task_EggHatch(taskID: number): void {
  if (!gPaletteFade.active) {
    // CleanupOverworldWindowsAndTilemaps is a no-op here: the canvas field owns no hardware windows.
    SetMainCallback2(CB2_EggHatch_0);
    tasks.destroy(taskID);
  }
}

/** CB2_EggHatch_0 (daycare.c). */
function CB2_EggHatch_0(): void {
  switch (gMain.state) {
    case 0:
      SetGpuReg(REG_OFFSET_DISPCNT, 0);
      sEggHatchData = {
        eggSpriteID: 0, pokeSpriteID: 0, CB2_state: 0, CB2_PalCounter: 0, eggPartyID: varGet(SV.x8004), windowId: 0,
        eggShardVelocityID: 0, species: 0, textColor: [0, 0, 0],
      };
      AllocateMonSpritesGfx();
      SetVBlankCallback(VBlankCB_EggHatch);
      varSet(SV.x8005, sound.getCurrentMapMusic());
      ResetBgsAndClearDma3BusyFlags(0);
      InitBgsFromTemplates(0, dc<BgTemplate[]>("sBgTemplates_EggHatch"));
      ChangeBgX(1, 0, 0);
      ChangeBgY(1, 0, 0);
      ChangeBgX(0, 0, 0);
      ChangeBgY(0, 0, 0);
      SetBgAttribute(1, 7, 2);
      SetBgTilemapBuffer(1, new Uint16Array(0x800));
      SetBgTilemapBuffer(0, new Uint16Array(0x1000));
      DeactivateAllTextPrinters();
      ResetPaletteFade();
      FreeAllSpritePalettes();
      ResetSpriteData();
      tasks.reset();
      ScanlineEffect_Stop();
      gMain.state++;
      break;
    case 1:
      InitWindows(dc<WindowTemplate[]>("sWinTemplates_EggHatch"));
      sEggHatchData!.windowId = 0;
      gMain.state++;
      break;
    case 2:
      DecompressAndLoadBgGfxUsingHeap(0, incbin("gBattleInterface_Textbox_Gfx"), incbin("gBattleInterface_Textbox_Gfx").length, 0, 0);
      CopyToBgTilemapBuffer(0, incbin16("gBattleInterface_Textbox_Tilemap"), 0, 0);
      LoadPalette(incbin("gBattleInterface_Textbox_Pal"), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
      gMain.state++;
      break;
    case 3: {
      const eggSheet = dc<{ size: number; tag: number }>("sEggHatch_Sheet");
      const shardSheet = dc<{ size: number; tag: number }>("sEggShards_Sheet");
      LoadSpriteSheet({ data: incbin("daycare.c:sEggHatchTiles"), size: eggSheet.size, tag: eggSheet.tag });
      LoadSpriteSheet({ data: incbin("daycare.c:sEggShardTiles"), size: shardSheet.size, tag: shardSheet.tag });
      LoadSpritePalette({ data: incbin("daycare.c:sEggPalette"), tag: dc<{ tag: number }>("sEgg_SpritePalette").tag });
      gMain.state++;
      break;
    }
    case 4:
      CopyBgTilemapBufferToVram(0);
      AddHatchedMonToParty(sEggHatchData!.eggPartyID, sGame!.overworld.header.regionMapSection);
      gMain.state++;
      break;
    case 5:
      sEggHatchData!.species = EggHatchCreateMonSprite(0, 0, sEggHatchData!.eggPartyID).species;
      gMain.state++;
      break;
    case 6:
      sEggHatchData!.pokeSpriteID = EggHatchCreateMonSprite(0, 1, sEggHatchData!.eggPartyID).spriteId;
      gMain.state++;
      break;
    case 7:
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_OBJ_1D_MAP);
      LoadPalette(incbin("gTradeGba2_Pal"), BG_PLTT_ID(1), 5 * PLTT_SIZE_4BPP);
      LoadBgTiles(1, incbin("gTradeGba_Gfx"), 0x1420, 0);
      CopyToBgTilemapBuffer(1, incbin16("gTradeOrHatchMonShadowTilemap"), 0x1000, 0);
      CopyBgTilemapBufferToVram(1);
      gMain.state++;
      break;
    case 8:
      SetMainCallback2(CB2_EggHatch_1);
      sEggHatchData!.CB2_state = 0;
      break;
  }
  tasks.run();
  RunTextPrinters();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

/** EggHatchSetMonNickname (daycare.c): the naming screen wrote the new nickname into gStringVar3. */
function EggHatchSetMonNickname(nameBuffer: number[]): void {
  const mon = save.party[varGet(SV.x8004)];
  mon.nickname = nameBuffer.slice();
  FreeMonSpritesGfx();
  sEggHatchData = null;
  HelpSystem_Enable();
  CB2_ReturnToField();
}

/** CB2_ReturnToField as used by the hatching scene: leave the hardware scene and resume the field script. */
function CB2_ReturnToField(): void {
  sScene?.leave();
  sScene = null;
  sGame!.scene = null;
  sGame!.setCallbacks(() => sGame!.overworld.cb1(), () => sGame!.overworld.cb2());
  sGame!.overworld.FieldCB_ContinueScriptHandleMusic(); // gFieldCallback = FieldCB_ContinueScriptHandleMusic in Task_EggHatch
}

/** Task_EggHatchPlayBGM (daycare.c). */
function Task_EggHatchPlayBGM(taskID: number): void {
  const data = tasks.data(taskID);
  if (data[0] === 0) sound.stopMapMusic();
  if (data[0] === 1) sound.playBGM(C.MUS_EVOLUTION_INTRO);
  if (data[0] > 60) {
    sound.playBGM(C.MUS_EVOLUTION);
    tasks.destroy(taskID);
    // UB: task is destroyed, yet the value is incremented
  }
  data[0]++;
}

/** CB2_EggHatch_1 (daycare.c). */
function CB2_EggHatch_1(): void {
  const d = sEggHatchData!;
  switch (d.CB2_state) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0x10, 0, RGB_BLACK);
      d.eggSpriteID = CreateSprite(eggTemplate("sSpriteTemplate_EggHatch"), 120, 75, 5);
      ShowBg(0);
      ShowBg(1);
      d.CB2_state++;
      tasks.create(Task_EggHatchPlayBGM, 5);
      break;
    case 1:
      if (!gPaletteFade.active) {
        FillWindowPixelBuffer(d.windowId, 0x00);
        d.CB2_PalCounter = 0;
        d.CB2_state++;
      }
      break;
    case 2:
      if (++d.CB2_PalCounter > 30) {
        d.CB2_state++;
        gSprites[d.eggSpriteID].callback = SpriteCB_Egg_0;
      }
      break;
    case 3:
      if (gSprites[d.eggSpriteID].callback === SpriteCallbackDummy) {
        sound.PlayCry_Normal(d.species, 0);
        d.CB2_state++;
      }
      break;
    case 4:
      if (sound.IsCryFinished()) d.CB2_state++;
      break;
    case 5:
      stringVars.var1 = Uint8Array.from(save.party[d.eggPartyID].nickname);
      EggHatchPrintMessage(d.windowId, expandPlaceholders(rom.text("gText_HatchedFromEgg")), 0, 3, 0xff);
      sound.playFanfare(C.MUS_EVOLVED);
      d.CB2_state++;
      PutWindowTilemap(d.windowId);
      CopyWindowToVram(d.windowId, COPYWIN_FULL);
      break;
    case 6:
      if (sound.isFanfareTaskInactive()) d.CB2_state++;
      break;
    case 7:
      if (sound.isFanfareTaskInactive()) d.CB2_state++;
      break;
    case 8:
      stringVars.var1 = Uint8Array.from(save.party[d.eggPartyID].nickname);
      EggHatchPrintMessage(d.windowId, expandPlaceholders(rom.text("gText_NickHatchPrompt")), 0, 2, 1);
      d.CB2_state++;
      break;
    case 9:
      if (!IsTextPrinterActive(d.windowId)) {
        LoadUserWindowGfx2(d.windowId, 0x140, BG_PLTT_ID(14));
        CreateYesNoMenu(dc<WindowTemplate>("sYesNoWinTemplate"), FONT_NORMAL_COPY_2, 0, 2, 0x140, 14, 0);
        d.CB2_state++;
      }
      break;
    case 10:
      switch (Menu_ProcessInputNoWrapClearOnChoose()) {
        case 0: {
          const mon = playerMon(d.eggPartyID);
          const nameBuffer = Array.from(mon.nickname);
          DoNamingScreen(C.NAMING_SCREEN_NICKNAME, nameBuffer, mon.species, GetMonGender(mon), mon.personality, () => EggHatchSetMonNickname(nameBuffer));
          break;
        }
        case 1:
        case -1:
          d.CB2_state++;
      }
      break;
    case 11:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
      d.CB2_state++;
      break;
    case 12:
      if (!gPaletteFade.active) {
        RemoveWindow(d.windowId);
        UnsetBgTilemapBuffer(0);
        UnsetBgTilemapBuffer(1);
        sEggHatchData = null;
        CB2_ReturnToField();
        HelpSystem_Enable();
      }
      break;
  }
  tasks.run();
  RunTextPrinters();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

/** SpriteCB_Egg_0 (daycare.c). */
function SpriteCB_Egg_0(sprite: Sprite): void {
  if (++sprite.data[0] > 20) {
    sprite.callback = SpriteCB_Egg_1;
    sprite.data[0] = 0;
  } else {
    sprite.data[1] = (sprite.data[1] + 20) & 0xff;
    sprite.x2 = Sin(sprite.data[1], 1);
    if (sprite.data[0] === 15) {
      sound.playSE(C.SE_BALL);
      StartSpriteAnim(sprite, 1);
      CreateRandomEggShardSprite();
    }
  }
}

/** SpriteCB_Egg_1 (daycare.c). */
function SpriteCB_Egg_1(sprite: Sprite): void {
  if (++sprite.data[2] > 30) {
    if (++sprite.data[0] > 20) {
      sprite.callback = SpriteCB_Egg_2;
      sprite.data[0] = 0;
      sprite.data[2] = 0;
    } else {
      sprite.data[1] = (sprite.data[1] + 20) & 0xff;
      sprite.x2 = Sin(sprite.data[1], 2);
      if (sprite.data[0] === 15) {
        sound.playSE(C.SE_BALL);
        StartSpriteAnim(sprite, 2);
      }
    }
  }
}

/** SpriteCB_Egg_2 (daycare.c). */
function SpriteCB_Egg_2(sprite: Sprite): void {
  if (++sprite.data[2] > 30) {
    if (++sprite.data[0] > 38) {
      sprite.callback = SpriteCB_Egg_3;
      sprite.data[0] = 0;
      const species = playerMon(sEggHatchData!.eggPartyID).species;
      gSprites[sEggHatchData!.pokeSpriteID].x2 = 0;
      gSprites[sEggHatchData!.pokeSpriteID].y2 = gMonFrontPicCoords()[species].y_offset;
    } else {
      sprite.data[1] = (sprite.data[1] + 20) & 0xff;
      sprite.x2 = Sin(sprite.data[1], 2);
      if (sprite.data[0] === 15) {
        sound.playSE(C.SE_BALL);
        StartSpriteAnim(sprite, 2);
        CreateRandomEggShardSprite();
        CreateRandomEggShardSprite();
      }
      if (sprite.data[0] === 30) sound.playSE(C.SE_BALL);
    }
  }
}

/** SpriteCB_Egg_3 (daycare.c). */
function SpriteCB_Egg_3(sprite: Sprite): void {
  if (++sprite.data[0] > 50) {
    sprite.callback = SpriteCB_Egg_4;
    sprite.data[0] = 0;
  }
}

/** SpriteCB_Egg_4 (daycare.c). */
function SpriteCB_Egg_4(sprite: Sprite): void {
  if (sprite.data[0] === 0) BeginNormalPaletteFade(PALETTES_ALL, -1, 0, 0x10, 0xffff);
  if (sprite.data[0] < 4) {
    for (let i = 0; i <= 3; i++) CreateRandomEggShardSprite();
  }
  sprite.data[0]++;
  if (!gPaletteFade.active) {
    sound.playSE(C.SE_EGG_HATCH);
    sprite.invisible = true;
    sprite.callback = SpriteCB_Egg_5;
    sprite.data[0] = 0;
  }
}

/** SpriteCB_Egg_5 (daycare.c). */
function SpriteCB_Egg_5(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    gSprites[sEggHatchData!.pokeSpriteID].invisible = false;
    StartSpriteAffineAnim(gSprites[sEggHatchData!.pokeSpriteID], 1);
  }
  if (sprite.data[0] === 8) BeginNormalPaletteFade(PALETTES_ALL, -1, 0x10, 0, 0xffff);
  if (sprite.data[0] <= 9) gSprites[sEggHatchData!.pokeSpriteID].y -= 1;
  if (sprite.data[0] > 40) sprite.callback = SpriteCallbackDummy;
  sprite.data[0]++;
}

/** SpriteCB_EggShard (daycare.c). */
function SpriteCB_EggShard(sprite: Sprite): void {
  sprite.data[4] += sprite.data[1];
  sprite.data[5] += sprite.data[2];
  sprite.x2 = Math.trunc(sprite.data[4] / 256);
  sprite.y2 = Math.trunc(sprite.data[5] / 256);
  sprite.data[2] += sprite.data[3];
  if (sprite.y + sprite.y2 > sprite.y + 20 && sprite.data[2] > 0) DestroySprite(sprite);
}

/** CreateRandomEggShardSprite (daycare.c). */
function CreateRandomEggShardSprite(): void {
  const d = sEggHatchData!;
  const velocities = dc<number[][]>("sEggShardVelocities");
  const velocity1 = velocities[d.eggShardVelocityID][0];
  const velocity2 = velocities[d.eggShardVelocityID][1];
  d.eggShardVelocityID++;
  const spriteAnimIndex = random() % 4;
  CreateEggShardSprite(120, 60, velocity1, velocity2, 100, spriteAnimIndex);
}

/** CreateEggShardSprite (daycare.c). */
function CreateEggShardSprite(x: number, y: number, data1: number, data2: number, data3: number, spriteAnimIndex: number): void {
  const spriteID = CreateSprite(eggTemplate("sSpriteTemplate_EggShard"), x, y, 4);
  gSprites[spriteID].callback = SpriteCB_EggShard;
  gSprites[spriteID].data[1] = data1;
  gSprites[spriteID].data[2] = data2;
  gSprites[spriteID].data[3] = data3;
  StartSpriteAnim(gSprites[spriteID], spriteAnimIndex);
}

/** EggHatchPrintMessage (daycare.c). */
function EggHatchPrintMessage(windowId: number, str: ArrayLike<number>, x: number, y: number, speed: number): void {
  FillWindowPixelBuffer(windowId, 0xff);
  sEggHatchData!.textColor = [0, 5, 6];
  AddTextPrinterParameterized4(windowId, FONT_NORMAL_COPY_2, x, y, 1, 1, sEggHatchData!.textColor, speed, str);
}
