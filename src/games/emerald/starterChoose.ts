// pokeemerald starter_choose.c (the Poké Ball bag screen of Route 101) and the battle_setup.c callbacks that
// follow it: ChooseStarter, CB2_GiveStarter, CB2_StartFirstBattle, CB2_EndFirstBattle.
// ADAPTATIONS: FONT_NARROW (the category line of the label) has no counterpart in the FireRed font set the engine
// loads, so FONT_SMALL draws it; the first battle's transition and BGM are started by the engine's startBattle
// (game.ts) instead of PlayBattleBGM + BattleTransition_Start + CB2_InitBattle in separate callbacks.
import { sound } from "@core/audio/sound";
import { expandPlaceholders } from "@core/gba/charmap";
import { FONT_NORMAL, FONT_SMALL, GetStringWidth } from "@core/gba/font";
import { A_BUTTON, DPAD_LEFT, DPAD_RIGHT, joy } from "@core/gba/input";
import { tasks } from "@core/gba/tasks";
import { cdata, incbin, incbin16, preloadIncbin } from "@core/hw/assets";
import {
  type BgTemplate, ChangeBgX, ChangeBgY, InitBgsFromTemplates, LoadBgTiles, LoadBgTilemap, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg,
} from "@core/hw/bg";
import { affineAnimFrom, animFrom, oamFrom, type CSpriteTemplate } from "@core/hw/cdataSprite";
import { SetGpuReg } from "@core/hw/gpu";
import { CreateYesNoMenu, DrawStdFrameWithCustomTileAndPalette, LoadUserWindowGfx, MENU_B_PRESSED, Menu_ProcessInputNoWrapClearOnChoose } from "@core/hw/menu";
import { DoScheduledBgTilemapCopiesToVram, ScheduleBgCopyTilemapToVram } from "@core/hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, LoadPalette, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade,
} from "@core/hw/palette";
import {
  BLDCNT_EFFECT_DARKEN, BLDCNT_TGT1_BD, BLDCNT_TGT1_BG1, BLDCNT_TGT1_BG2, BLDCNT_TGT1_BG3, BLDCNT_TGT1_OBJ, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON,
  DISPCNT_WIN0_ON, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V,
  REG_OFFSET_WININ, REG_OFFSET_WINOUT, WININ_WIN0_BG_ALL, WININ_WIN0_CLR, WININ_WIN0_OBJ, WINOUT_WIN01_BG_ALL, WINOUT_WIN01_OBJ, WIN_RANGE,
} from "@core/hw/ppu";
import { HwScene, SetMainCallback2, SetVBlankCallback } from "@core/hw/runtime";
import { ScanlineEffect_Stop } from "@core/hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, FreeSpriteOamMatrix, gSprites, LoadOam, LoadSpritePalettes,
  LoadSpriteSheet, ProcessSpriteCopyRequests, ResetSpriteData, StartSpriteAnimIfDifferent, TAG_NONE, gDummySpriteAffineAnimTable, type Sprite, type SpriteCallback, type SpriteTemplate,
} from "@core/hw/sprite";
import { DeactivateAllTextPrinters, AddTextPrinterParameterized, AddTextPrinterParameterized3, RunTextPrinters } from "@core/hw/text";
import { Sin } from "@core/hw/trig";
import {
  AddWindow, ClearWindowTilemap, FillWindowPixelBuffer, InitWindows, PutWindowTilemap, RemoveWindow, type WindowTemplate,
} from "@core/hw/window";
import { speciesName } from "@core/pokemon/pokemon";
import { SpeciesToNationalPokedexNum } from "@core/pokemon/mon";
import { createMon } from "@core/pokemon/pokemon";
import { CreateMonPicSprite_Affine, FreeAndDestroyMonPicSprite, MON_PIC_AFFINE_FRONT, ResetAllPicSprites } from "@core/trainerPokemonSprites";
import { rom } from "@core/rom";
import type { Game } from "@game/game";
import { incrementGameStat, SV, varGet, varSet } from "@game/save";
import * as EM from "./generated/constants";

const STARTER_MON_COUNT = 3;
// Position of the sprite of the selected starter Pokémon
const STARTER_PKMN_POS_X = 240 / 2;
const STARTER_PKMN_POS_Y = 64;
const SHINY_ODDS = 8;
const WINDOW_NONE = 0xff;

// Data for Task_StarterChoose
const tStarterSelection = 0, tPkmnSpriteId = 1, tCircleSpriteId = 2;
// Data for sSpriteTemplate_Pokeball
const sTaskId = 0, sBallId = 1;

const sc = <T>(name: string): T => cdata<T>("em:starter_choose", name);

/** A SpriteTemplate of the file's own tables: the anim/affine/oam symbols are resolved inside em:starter_choose (a global symbol
 * lookup would find same-named tables of the other loaded cdata files). */
function templateOf(name: string, callback: SpriteCallback): SpriteTemplate {
  const t = sc<CSpriteTemplate>(name);
  const table = (ref: unknown, one: (n: string) => unknown[]): unknown[][] => (ref ? sc<Array<{ $sym: string }>>((ref as { $sym: string }).$sym).map(r => one(r.$sym)) : []);
  return {
    tileTag: t.tileTag, paletteTag: t.paletteTag,
    oam: oamFrom(sc<object>((t.oam as { $sym: string }).$sym)),
    anims: table(t.anims, n => animFrom(sc<unknown[]>(n))) as SpriteTemplate["anims"],
    images: null,
    affineAnims: (t.affineAnims && (t.affineAnims as { $sym: string }).$sym !== "gDummySpriteAffineAnimTable"
      ? table(t.affineAnims, n => affineAnimFrom(sc<unknown[]>(n))) : gDummySpriteAffineAnimTable) as SpriteTemplate["affineAnims"],
    callback,
  };
}

const symbols = [
  "gBirchBagGrass_Gfx", "gBirchBagGrass_Pal", "gBirchBagTilemap", "gBirchGrassTilemap", "gPokeballSelection_Gfx", "sPokeballSelection_Pal",
  "sStarterCircle_Gfx", "sStarterCircle_Pal",
].map(name => `starter_choose.c:${name}`).concat("graphics.c:gMessageBox_Pal");

/** Loads the INCBIN packs of the starter screen (the specials run synchronously). */
export function preloadStarterChoose(): Promise<void> { return preloadIncbin(symbols); }

let sStarterLabelWindowId = WINDOW_NONE;
let sGame: Game | null = null;
let sScene: HwScene | null = null;

/** starter_choose.c GetStarterPokemon */
export function GetStarterPokemon(chosenStarterId: number): number {
  if (chosenStarterId > STARTER_MON_COUNT) chosenStarterId = 0;
  return sc<number[]>("sStarterMon")[chosenStarterId]!;
}

/** starter_choose.c VblankCB_StarterChoose */
function VblankCB_StarterChoose(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

/** battle_setup.c ChooseStarter: the screen runs on its own callbacks until a starter is confirmed. */
export function ChooseStarter(game: Game): void {
  sGame = game;
  game.overworld.script.ScriptContext_Stop();
  const scene = new HwScene();
  scene.enter();
  sScene = scene;
  game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  CB2_ChooseStarter();
}

/** starter_choose.c CB2_ChooseStarter */
function CB2_ChooseStarter(): void {
  SetVBlankCallback(null);
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  for (let bg = 0; bg < 4; bg++) { ChangeBgX(bg, 0, 0); ChangeBgY(bg, 0, 0); }
  // DmaFill16/32 of VRAM, OAM and PLTT: the hardware layer starts each scene cleared
  LoadBgTiles(2, incbin("starter_choose.c:gBirchBagGrass_Gfx"), 0x2000, 0);
  ResetBgsAndClearDma3BusyFlags(0);
  InitBgsFromTemplates(0, sc<BgTemplate[]>("sBgTemplates"));
  LoadBgTiles(2, incbin("starter_choose.c:gBirchBagGrass_Gfx"), 0x2000, 0);
  LoadBgTilemap(3, incbin("starter_choose.c:gBirchBagTilemap"), 0x500, 0);
  LoadBgTilemap(2, incbin("starter_choose.c:gBirchGrassTilemap"), 0x800, 0);
  SetBgTilemapBuffer(0, new Uint16Array(0x400));
  InitWindows(sc<WindowTemplate[]>("sWindowTemplates"));
  DeactivateAllTextPrinters();
  LoadUserWindowGfx(0, 0x2a8, BG_PLTT_ID(13));
  ScanlineEffect_Stop();
  tasks.reset();
  ResetSpriteData();
  ResetPaletteFade();
  FreeAllSpritePalettes();
  ResetAllPicSprites();
  LoadPalette(incbin("graphics.c:gMessageBox_Pal"), BG_PLTT_ID(14), PLTT_SIZE_4BPP); // GetOverworldTextboxPalettePtr
  LoadPalette(incbin("starter_choose.c:gBirchBagGrass_Pal"), BG_PLTT_ID(0), 64);
  const ball = sc<{ size: number; tag: number }[]>("sSpriteSheet_PokeballSelect")[0]!;
  LoadSpriteSheet({ data: incbin("starter_choose.c:gPokeballSelection_Gfx"), size: ball.size, tag: ball.tag });
  const circle = sc<{ size: number; tag: number }[]>("sSpriteSheet_StarterCircle")[0]!;
  LoadSpriteSheet({ data: incbin("starter_choose.c:sStarterCircle_Gfx"), size: circle.size, tag: circle.tag });
  const palettes = sc<{ tag: number }[]>("sSpritePalettes_StarterChoose");
  LoadSpritePalettes([
    { data: incbin16("starter_choose.c:sPokeballSelection_Pal"), tag: palettes[0]!.tag },
    { data: incbin16("starter_choose.c:sStarterCircle_Pal"), tag: palettes[1]!.tag },
  ]);
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0x10, 0, RGB_BLACK);
  SetVBlankCallback(VblankCB_StarterChoose);
  SetMainCallback2(CB2_StarterChoose);
  SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ);
  SetGpuReg(REG_OFFSET_WIN0H, 0);
  SetGpuReg(REG_OFFSET_WIN0V, 0);
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_TGT1_BG2 | BLDCNT_TGT1_BG3 | BLDCNT_TGT1_OBJ | BLDCNT_TGT1_BD | BLDCNT_EFFECT_DARKEN);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 7);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_OBJ_ON | DISPCNT_OBJ_1D_MAP);
  ShowBg(0);
  ShowBg(2);
  ShowBg(3);

  const taskId = tasks.create(Task_StarterChoose, 0);
  tasks.data(taskId)[tStarterSelection] = 1;

  const coords = sc<number[][]>("sPokeballCoords");
  // Create hand sprite
  let spriteId = CreateSprite(templateOf("sSpriteTemplate_Hand", SpriteCB_SelectionHand), 120, 56, 2);
  gSprites[spriteId]!.data[0] = taskId;
  // Create three Poké Ball sprites
  for (let ballId = 0; ballId < 3; ballId++) {
    spriteId = CreateSprite(templateOf("sSpriteTemplate_Pokeball", SpriteCB_Pokeball), coords[ballId]![0]!, coords[ballId]![1]!, 2);
    gSprites[spriteId]!.data[sTaskId] = taskId;
    gSprites[spriteId]!.data[sBallId] = ballId;
  }
  sStarterLabelWindowId = WINDOW_NONE;
}

/** starter_choose.c CB2_StarterChoose */
function CB2_StarterChoose(): void {
  tasks.run();
  RunTextPrinters();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

/** starter_choose.c Task_StarterChoose */
function Task_StarterChoose(taskId: number): void {
  CreateStarterPokemonLabel(tasks.data(taskId)[tStarterSelection]!);
  DrawStdFrameWithCustomTileAndPalette(0, false, 0x2a8, 0xd);
  AddTextPrinterParameterized(0, FONT_NORMAL, expandPlaceholders(rom.text("gText_BirchInTrouble")), 0, 1, 0, null);
  PutWindowTilemap(0);
  ScheduleBgCopyTilemapToVram(0);
  tasks.setFunc(taskId, Task_HandleStarterChooseInput);
}

/** starter_choose.c Task_HandleStarterChooseInput */
function Task_HandleStarterChooseInput(taskId: number): void {
  const data = tasks.data(taskId);
  const selection = data[tStarterSelection]!;
  if (joy.newKeys & A_BUTTON) {
    ClearStarterLabel();
    const coords = sc<number[][]>("sPokeballCoords");
    // Create white circle background
    let spriteId = CreateSprite(templateOf("sSpriteTemplate_StarterCircle", SpriteCB_StarterPokemon), coords[selection]![0]!, coords[selection]![1]!, 1);
    data[tCircleSpriteId] = spriteId;
    // Create Pokémon sprite
    spriteId = CreatePokemonFrontSprite(GetStarterPokemon(data[tStarterSelection]!), coords[selection]![0]!, coords[selection]![1]!);
    gSprites[spriteId]!.affineAnims = [affineAnimFrom(sc<unknown[]>("sAffineAnim_StarterPokemon"))];
    gSprites[spriteId]!.callback = SpriteCB_StarterPokemon;
    data[tPkmnSpriteId] = spriteId;
    tasks.setFunc(taskId, Task_WaitForStarterSprite);
  } else if ((joy.newKeys & DPAD_LEFT) && selection > 0) {
    data[tStarterSelection] = selection - 1;
    tasks.setFunc(taskId, Task_MoveStarterChooseCursor);
  } else if ((joy.newKeys & DPAD_RIGHT) && selection < STARTER_MON_COUNT - 1) {
    data[tStarterSelection] = selection + 1;
    tasks.setFunc(taskId, Task_MoveStarterChooseCursor);
  }
}

/** starter_choose.c Task_WaitForStarterSprite */
function Task_WaitForStarterSprite(taskId: number): void {
  const circle = gSprites[tasks.data(taskId)[tCircleSpriteId]!]!;
  if (circle.affineAnimEnded && circle.x === STARTER_PKMN_POS_X && circle.y === STARTER_PKMN_POS_Y)
    tasks.setFunc(taskId, Task_AskConfirmStarter);
}

/** starter_choose.c Task_AskConfirmStarter */
function Task_AskConfirmStarter(taskId: number): void {
  sound.PlayCry_Normal(GetStarterPokemon(tasks.data(taskId)[tStarterSelection]!), 0);
  FillWindowPixelBuffer(0, 0x11);
  AddTextPrinterParameterized(0, FONT_NORMAL, expandPlaceholders(rom.text("gText_ConfirmStarterChoice")), 0, 1, 0, null);
  ScheduleBgCopyTilemapToVram(0);
  CreateYesNoMenu(sc<WindowTemplate>("sWindowTemplate_ConfirmStarter"), FONT_NORMAL, 0, 1, 0x2a8, 0xd, 0);
  tasks.setFunc(taskId, Task_HandleConfirmStarterInput);
}

/** starter_choose.c Task_HandleConfirmStarterInput */
function Task_HandleConfirmStarterInput(taskId: number): void {
  const data = tasks.data(taskId);
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0: // YES
      // Return the starter choice and exit.
      varSet(SV.RESULT, data[tStarterSelection]!);
      ResetAllPicSprites();
      CB2_GiveStarter();
      break;
    case 1: // NO
    case MENU_B_PRESSED: {
      sound.playSE(sound.c("SE_SELECT"));
      let spriteId = data[tPkmnSpriteId]!;
      FreeSpriteOamMatrix(gSprites[spriteId]!);
      FreeAndDestroyMonPicSprite(spriteId);
      spriteId = data[tCircleSpriteId]!;
      FreeSpriteOamMatrix(gSprites[spriteId]!);
      DestroySprite(gSprites[spriteId]!);
      tasks.setFunc(taskId, Task_DeclineStarter);
      break;
    }
  }
}

/** starter_choose.c Task_DeclineStarter */
function Task_DeclineStarter(taskId: number): void { tasks.setFunc(taskId, Task_StarterChoose); }

/** international_string_util.c GetStringWidthDifference / GetStringCenterAlignXOffset */
function GetStringCenterAlignXOffset(fontId: number, str: ArrayLike<number>, totalWidth: number): number {
  const stringWidth = GetStringWidth(fontId, str, 0);
  return Math.trunc((totalWidth > stringWidth ? totalWidth - stringWidth : 0) / 2);
}

/** international_string_util.c CopyMonCategoryText: "<category> POKéMON" from gPokedexEntries (dexNum is the index). */
function CopyMonCategoryText(dexNum: number): number[] {
  const entry = cdata<{ categoryName: number[] }[]>("em:pokedex", "gPokedexEntries")[dexNum]!;
  const out: number[] = [];
  for (const c of entry.categoryName) { if (c === 0xff) break; out.push(c); }
  out.push(0x00); // CHAR_SPACE
  out.push(...rom.text("gText_Pokemon"));
  return out; // gText_Pokemon carries the terminator
}

/** starter_choose.c CreateStarterPokemonLabel */
function CreateStarterPokemonLabel(selection: number): void {
  const textColors = [0, 1, 3]; // sTextColors: TEXT_COLOR_TRANSPARENT, TEXT_COLOR_WHITE, TEXT_COLOR_LIGHT_GRAY
  const species = GetStarterPokemon(selection);
  const categoryText = CopyMonCategoryText(SpeciesToNationalPokedexNum(species));
  const labelCoords = sc<number[][]>("sStarterLabelCoords");
  const winTemplate: WindowTemplate = { ...sc<WindowTemplate>("sWindowTemplate_StarterLabel"), tilemapLeft: labelCoords[selection]![0]!, tilemapTop: labelCoords[selection]![1]! };
  sStarterLabelWindowId = AddWindow(winTemplate);
  FillWindowPixelBuffer(sStarterLabelWindowId, 0);
  let width = GetStringCenterAlignXOffset(FONT_SMALL, categoryText, 0x68); // FONT_NARROW
  AddTextPrinterParameterized3(sStarterLabelWindowId, FONT_SMALL, width, 1, textColors, 0, categoryText);
  const name = speciesName(species);
  width = GetStringCenterAlignXOffset(FONT_NORMAL, name, 0x68);
  AddTextPrinterParameterized3(sStarterLabelWindowId, FONT_NORMAL, width, 17, textColors, 0, name);
  PutWindowTilemap(sStarterLabelWindowId);
  ScheduleBgCopyTilemapToVram(0);
  const labelLeft = labelCoords[selection]![0]! * 8 - 4;
  const labelRight = (labelCoords[selection]![0]! + 13) * 8 + 4;
  const labelTop = labelCoords[selection]![1]! * 8;
  const labelBottom = (labelCoords[selection]![1]! + 4) * 8;
  SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(labelLeft, labelRight));
  SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(labelTop, labelBottom));
}

/** starter_choose.c ClearStarterLabel */
function ClearStarterLabel(): void {
  FillWindowPixelBuffer(sStarterLabelWindowId, 0);
  ClearWindowTilemap(sStarterLabelWindowId);
  RemoveWindow(sStarterLabelWindowId);
  sStarterLabelWindowId = WINDOW_NONE;
  SetGpuReg(REG_OFFSET_WIN0H, 0);
  SetGpuReg(REG_OFFSET_WIN0V, 0);
  ScheduleBgCopyTilemapToVram(0);
}

/** starter_choose.c Task_MoveStarterChooseCursor / Task_CreateStarterLabel */
function Task_MoveStarterChooseCursor(taskId: number): void {
  ClearStarterLabel();
  tasks.setFunc(taskId, Task_CreateStarterLabel);
}
function Task_CreateStarterLabel(taskId: number): void {
  CreateStarterPokemonLabel(tasks.data(taskId)[tStarterSelection]!);
  tasks.setFunc(taskId, Task_HandleStarterChooseInput);
}

/** starter_choose.c CreatePokemonFrontSprite */
function CreatePokemonFrontSprite(species: number, x: number, y: number): number {
  const spriteId = CreateMonPicSprite_Affine(species, SHINY_ODDS, 0, MON_PIC_AFFINE_FRONT, x, y, 14, TAG_NONE);
  gSprites[spriteId]!.oam.priority = 0;
  return spriteId;
}

/** starter_choose.c SpriteCB_SelectionHand: float up and down above the selected Poké Ball */
function SpriteCB_SelectionHand(sprite: Sprite): void {
  const cursor = sc<number[][]>("sCursorCoords")[tasks.data(sprite.data[0]!)[tStarterSelection]!]!;
  sprite.x = cursor[0]!;
  sprite.y = cursor[1]!;
  sprite.y2 = Sin(sprite.data[1]!, 8);
  sprite.data[1] = (sprite.data[1]! & 0xff) + 4;
}

/** starter_choose.c SpriteCB_Pokeball: animate the Poké Ball if currently selected */
function SpriteCB_Pokeball(sprite: Sprite): void {
  if (tasks.data(sprite.data[sTaskId]!)[tStarterSelection] === sprite.data[sBallId]) StartSpriteAnimIfDifferent(sprite, 1);
  else StartSpriteAnimIfDifferent(sprite, 0);
}

/** starter_choose.c SpriteCB_StarterPokemon: move the sprite to the upper center of the screen */
function SpriteCB_StarterPokemon(sprite: Sprite): void {
  if (sprite.x > STARTER_PKMN_POS_X) sprite.x -= 4;
  if (sprite.x < STARTER_PKMN_POS_X) sprite.x += 4;
  if (sprite.y > STARTER_PKMN_POS_Y) sprite.y -= 2;
  if (sprite.y < STARTER_PKMN_POS_Y) sprite.y += 2;
}

/** battle_setup.c CB2_GiveStarter. The Overworld task list was snapshot by HwScene.enter, so ResetTasks is the scene's. */
function CB2_GiveStarter(): void {
  const game = sGame!;
  varSet(EM.VAR_STARTER_MON, varGet(SV.RESULT));
  const starterMon = GetStarterPokemon(varGet(SV.RESULT));
  game.scriptGiveMon(starterMon, 5, EM.ITEM_NONE);
  tasks.reset();
  CB2_StartFirstBattle();
}

/** battle_setup.c CB2_StartFirstBattle / CB2_EndFirstBattle against the Zigzagoon that InitBtlControllers
 * (battle_controllers.c) creates for BATTLE_TYPE_FIRST_BATTLE: level 2, random IVs, no held item.
 * GAP: the engine's battle core gives BATTLE_TYPE_FIRST_BATTLE the FireRed meaning (Oak's lab controller), so the
 * Emerald rules of that flag are not applied: the wild Zigzagoon can be fled from (B_MSG_DONT_LEAVE_BIRCH), can
 * land critical hits and does not flee at 20 HP (AI_FirstBattle); the battle is an ordinary wild battle. */
function CB2_StartFirstBattle(): void {
  const game = sGame!;
  sScene?.leave();
  sScene = null;
  const enemy = createMon(EM.SPECIES_ZIGZAGOON, 2);
  incrementGameStat(EM.GAME_STAT_TOTAL_BATTLES);
  incrementGameStat(EM.GAME_STAT_WILD_BATTLES);
  game.setCallbacks(() => game.overworld.cb1(), () => game.overworld.cb2());
  game.startBattle({
    kind: "wild",
    enemyParty: [enemy],
    transition: EM.B_TRANSITION_BLUR,
    onEnd: () => {
      game.overworld.Overworld_ClearSavedMusic();
      game.returnToFieldContinueScript(true);
    },
  });
}

