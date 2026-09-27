// battle_controller_safari.c: the player's controller in Safari Zone battles
// (BALL / BAIT / ROCK / RUN). Most commands complete immediately.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { A_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_NEW } from "../gba/input";
import { rom } from "../rom";
import { save } from "../save";
import { G, gActionSelectionCursor, gBattleBufferA, gBattlerControllerFuncs, gBattlerPartyIndexes, gBattlerSpriteIds, gBattleSpritesDataPtr, gBitTable, gDisplayedStringBattle, gHealthboxSpriteIds } from "./globals";
import { BtlController_EmitTwoReturnValues, BUFFER_B } from "./controllers";
import { CreateSprite, gSprites, SpriteCallbackDummy } from "../hw/sprite";
import { playerMon, GetMonData } from "../pokemon/mon";
import { DecompressTrainerBackPalette, gTrainerBackPicCoords, InitAndLaunchSpecialAnimation, PlaySE12WithPanning, TryHandleLaunchBattleTableAnimation } from "./gfx_sfx_util";
import { BattlePutTextOnWindow, BattleStringExpandPlaceholdersToDisplayedString, BattleStringShouldBeColored, BufferStringBattle } from "./message";
import { BeginFastPaletteFade } from "../hw/palette";
import { IsDma3ManagerBusyWithBgCopy } from "../hw/bg";
import { gMultiuseSpriteTemplate, SetMultiuseSpriteTemplateToTrainerBack, SpriteCB_TrainerSlideIn } from "./anim";
import { SetHealthboxSpriteVisible, StartHealthboxSlideIn, UpdateHealthboxAttribute } from "./interface";
import { HandleIntroSlide } from "./intro";
import { IsTextPrinterActive } from "../hw/text";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import { ActionSelectionCreateCursorAt, ActionSelectionDestroyCursorAt } from "./controller_player";

export function SetControllerToSafari(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = SafariBufferRunCommand;
}

function SafariBufferExecCompleted(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = SafariBufferRunCommand;
  G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags & ~gBitTable[G.gActiveBattler]) >>> 0;
}

function SafariBufferRunCommand(): void {
  if (G.gBattleControllerExecFlags & gBitTable[G.gActiveBattler]) {
    const fn = COMMANDS[gBattleBufferA[G.gActiveBattler][0]];
    if (fn) fn(); else SafariBufferExecCompleted();
  }
}

function cursorMove(mask: number, wantSet: boolean): void {
  const b = G.gActiveBattler;
  if (((gActionSelectionCursor[b] & mask) !== 0) === wantSet) {
    sound.playSE(C.SE_SELECT);
    ActionSelectionDestroyCursorAt(gActionSelectionCursor[b]);
    gActionSelectionCursor[b] ^= mask;
    ActionSelectionCreateCursorAt(gActionSelectionCursor[b], 0);
  }
}

function HandleInputChooseAction(): void {
  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    const actions = [C.B_ACTION_SAFARI_BALL, C.B_ACTION_SAFARI_BAIT, C.B_ACTION_SAFARI_GO_NEAR, C.B_ACTION_SAFARI_RUN];
    BtlController_EmitTwoReturnValues(BUFFER_B, actions[gActionSelectionCursor[G.gActiveBattler]], 0);
    SafariBufferExecCompleted();
  } else if (JOY_NEW(DPAD_LEFT)) cursorMove(1, true);
  else if (JOY_NEW(DPAD_RIGHT)) cursorMove(1, false);
  else if (JOY_NEW(DPAD_UP)) cursorMove(2, true);
  else if (JOY_NEW(DPAD_DOWN)) cursorMove(2, false);
}

function CompleteOnBattlerSpriteCallbackDummy(): void {
  if (gSprites[gBattlerSpriteIds[G.gActiveBattler]].callback === SpriteCallbackDummy) SafariBufferExecCompleted();
}
function CompleteOnInactiveTextPrinter(): void {
  if (!IsTextPrinterActive(0)) SafariBufferExecCompleted();
}
function CompleteOnHealthboxSpriteCallbackDummy(): void {
  if (gSprites[gHealthboxSpriteIds[G.gActiveBattler]].callback === SpriteCallbackDummy) SafariBufferExecCompleted();
}
function CompleteOnSpecialAnimDone(): void {
  if (!G.gDoingBattleAnim || !gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].specialAnimActive) SafariBufferExecCompleted();
}
function CompleteOnFinishedBattleAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].animFromTableActive) SafariBufferExecCompleted();
}

function SafariHandleDrawTrainerPic(): void {
  const b = G.gActiveBattler;
  const gender = save.playerGender;
  DecompressTrainerBackPalette(gender, b);
  SetMultiuseSpriteTemplateToTrainerBack(gender, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), 80, (8 - gTrainerBackPicCoords(gender).size) * 4 + 80, 30);
  const s = gSprites[gBattlerSpriteIds[b]];
  s.oam.paletteNum = b;
  s.x2 = 240;
  s.data[0] = -2;
  s.callback = SpriteCB_TrainerSlideIn;
  gBattlerControllerFuncs[b] = CompleteOnBattlerSpriteCallbackDummy;
}

function ballThrow(caseId: number): void {
  const b = G.gActiveBattler;
  gBattleSpritesDataPtr.animationData.ballThrowCaseId = caseId;
  G.gDoingBattleAnim = true;
  InitAndLaunchSpecialAnimation(b, b, GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.B_ANIM_BALL_THROW_WITH_TRAINER);
  gBattlerControllerFuncs[b] = CompleteOnSpecialAnimDone;
}

function SafariHandlePrintString(): void {
  const b = G.gActiveBattler;
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  const stringId = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  BufferStringBattle(stringId);
  if (BattleStringShouldBeColored(stringId)) BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG | C.B_TEXT_FLAG_NPC_CONTEXT_FONT);
  else BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
  gBattlerControllerFuncs[b] = CompleteOnInactiveTextPrinter;
}

function HandleChooseActionAfterDma3(): void {
  if (!IsDma3ManagerBusyWithBgCopy()) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 160;
    gBattlerControllerFuncs[G.gActiveBattler] = HandleInputChooseAction;
  }
}

function SafariHandleChooseAction(): void {
  const b = G.gActiveBattler;
  gBattlerControllerFuncs[b] = HandleChooseActionAfterDma3;
  BattlePutTextOnWindow(rom.text("gText_EmptyString3"), C.B_WIN_MSG);
  BattlePutTextOnWindow(rom.text("gText_SafariZoneMenu"), C.B_WIN_ACTION_MENU);
  for (let i = 0; i < 4; i++) ActionSelectionDestroyCursorAt(i);
  ActionSelectionCreateCursorAt(gActionSelectionCursor[b], 0);
  BattleStringExpandPlaceholdersToDisplayedString(rom.text("gText_WhatWillPlayerThrow"));
  BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_ACTION_PROMPT);
}

const done = (): void => SafariBufferExecCompleted();

const COMMANDS: Record<number, () => void> = {
  [C.CONTROLLER_DRAWTRAINERPIC]: SafariHandleDrawTrainerPic,
  [C.CONTROLLER_SUCCESSBALLTHROWANIM]: () => ballThrow(C.BALL_3_SHAKES_SUCCESS),
  [C.CONTROLLER_BALLTHROWANIM]: () => ballThrow(gBattleBufferA[G.gActiveBattler][1]),
  [C.CONTROLLER_PRINTSTRING]: SafariHandlePrintString,
  [C.CONTROLLER_PRINTSTRINGPLAYERONLY]: () => { if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER) SafariHandlePrintString(); else done(); },
  [C.CONTROLLER_CHOOSEACTION]: SafariHandleChooseAction,
  [C.CONTROLLER_STATUSICONUPDATE]: () => {
    UpdateHealthboxAttribute(gHealthboxSpriteIds[G.gActiveBattler], playerMon(gBattlerPartyIndexes[G.gActiveBattler]), C.HEALTHBOX_SAFARI_BALLS_TEXT);
    done();
  },
  [C.CONTROLLER_PLAYSE]: () => {
    const b = G.gActiveBattler;
    PlaySE12WithPanning(gBattleBufferA[b][1] | (gBattleBufferA[b][2] << 8), GetBattlerSide(b) === C.B_SIDE_PLAYER ? C.SOUND_PAN_ATTACKER : C.SOUND_PAN_TARGET);
    done();
  },
  [C.CONTROLLER_PLAYFANFARE]: () => {
    const b = G.gActiveBattler;
    sound.playFanfare(gBattleBufferA[b][1] | (gBattleBufferA[b][2] << 8));
    done();
  },
  [C.CONTROLLER_FAINTINGCRY]: () => {
  sound.PlayCry_Normal(GetMonData(playerMon(gBattlerPartyIndexes[G.gActiveBattler]), C.MON_DATA_SPECIES), 25);
    done();
  },
  [C.CONTROLLER_INTROSLIDE]: () => {
    HandleIntroSlide(gBattleBufferA[G.gActiveBattler][1]);
    G.gIntroSlideFlags |= 1;
    done();
  },
  [C.CONTROLLER_INTROTRAINERBALLTHROW]: () => {
    const b = G.gActiveBattler;
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], playerMon(gBattlerPartyIndexes[b]), C.HEALTHBOX_SAFARI_ALL_TEXT);
    StartHealthboxSlideIn(b);
    SetHealthboxSpriteVisible(gHealthboxSpriteIds[b]);
    gBattlerControllerFuncs[b] = CompleteOnHealthboxSpriteCallbackDummy;
  },
  [C.CONTROLLER_BATTLEANIMATION]: () => {
    const b = G.gActiveBattler;
    const argument = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
    if (TryHandleLaunchBattleTableAnimation(b, b, b, gBattleBufferA[b][1], argument)) done();
    else gBattlerControllerFuncs[b] = CompleteOnFinishedBattleAnimation;
  },
  [C.CONTROLLER_ENDLINKBATTLE]: () => {
    G.gBattleOutcome = gBattleBufferA[G.gActiveBattler][1];
    sound.fadeOutBGM(5);
    BeginFastPaletteFade(3);
    done();
  },
  [C.CONTROLLER_TERMINATOR_NOP]: () => {},
};
