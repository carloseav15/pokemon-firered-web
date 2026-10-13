// easy_chat_2.c: the Easy Chat screen's task flow and joypad state machine (field select, footer, group
// select, word select and the yes/no prompts); easy_chat_3.c draws what these handlers request.
import * as C from "./generated/constants";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, joy, SELECT_BUTTON, START_BUTTON } from "./gba/input";
import { tasks } from "./gba/tasks";
import { cdata, type SymRef } from "./hw/assets";
import { Menu_ProcessInputNoWrapClearOnChoose } from "./hw/menu";
import { BeginNormalPaletteFade, BlendPalettes, gPaletteFade, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { HwScene, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { FreeAllWindowBuffers } from "./hw/window";
import { rom } from "./rom";
import { flagSet, SV, varGet, varSet, save } from "./save";
import { DestroyEasyChatSelectionData, GetDisplayedWordByIndex, GetNumDisplayableGroups, GetNumDisplayedWords, GetSelectedGroupByIndex, GetUnlockedECWords, InitEasyChatSelection } from "./easyChat";
import {
  DestroyEasyChatGraphicsResources, EasyChatInterfaceCommand_Run, EasyChatInterfaceCommand_Setup, InitEasyChatGraphicsWork,
  LoadEasyChatGraphics,
} from "./easyChat3";
import { sound } from "./audio/sound";
import { IsUpdateLinkStateCBActive } from "./linkState";
import type { Game } from "./game";

// task data slots (EZCHAT_TASK_*)
const EZCHAT_TASK_STATE = 0;
const EZCHAT_TASK_TYPE = 1;

const EC_WORD_UNDEFINED = C.EC_WORD_UNDEFINED;
const NELEMS_ALPHABET_COLUMNS = 7;
const sAlphabetLayout: number[][] = [
  [1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26],
];

type EasyChatScreenTemplate = {
  type: number;
  numColumns: number;
  numRows: number;
  frameId: number;
  titleText?: SymRef | 0;
  instructionsText1?: SymRef | 0;
  instructionsText2?: SymRef | 0;
  confirmText1?: SymRef | 0;
  confirmText2?: SymRef | 0;
};

/** struct EasyChatScreen. */
type EasyChatScreen = {
  type: number;
  templateId: number;
  numColumns: number;
  numRows: number;
  state: number;
  mainCursorColumn: number;
  mainCursorRow: number;
  numWords: number;
  stateBackup: number;
  isAlphaMode: boolean;
  selectGroupCursorX: number;
  selectGroupCursorY: number;
  selectGroupRowsAbove: number;
  selectGroupNumRows: number;
  selectWordRowsAbove: number;
  selectWordNumRows: number;
  selectWordCursorX: number;
  selectWordCursorY: number;
  words: number[];
  ecWordBuffer: number[];
};

let sEasyChatScreen: EasyChatScreen | null = null;
const S = (): EasyChatScreen => sEasyChatScreen!;

/** Browser adaptation of the C MainCallback: what runs once the screen has been dismantled. */
let sExitCallback: (() => void) | null = null;
let sScene: HwScene | null = null;
let sGame: Game | null = null;

function templates(): EasyChatScreenTemplate[] {
  return cdata<EasyChatScreenTemplate[]>("easy_chat_2", "sEasyChatScreenTemplates");
}

function tpl(): EasyChatScreenTemplate {
  return templates()[S().templateId];
}

function text(ref: SymRef | 0 | undefined): Uint8Array | null {
  return ref ? rom.text(ref.$sym) : null;
}

/** DoEasyChatScreen (easy_chat_2.c): `callback` is the C MainCallback, run after the screen's HwScene is left. */
export function DoEasyChatScreen(game: Game, type: number, words: number[], callback: () => void): void {
  sGame = game;
  sExitCallback = callback;
  const scene = new HwScene();
  scene.enter();
  sScene = scene;
  game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  const taskId = tasks.create(Task_InitEasyChat, 0);
  tasks.data(taskId)[EZCHAT_TASK_TYPE] = type;
  taskWords = words;
  SetMainCallback2(CB2_EasyChatScreen);
}

let taskWords: number[] = [];

/** CB2_EasyChatScreen (easy_chat_2.c). */
function CB2_EasyChatScreen(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

/** VBlankCallback_EasyChatScreen (easy_chat_2.c). */
function VBlankCallback_EasyChatScreen(): void {
  TransferPlttBuffer();
  LoadOam();
  ProcessSpriteCopyRequests();
}

/** SetEasyChatTaskFunc (easy_chat_2.c). */
function SetEasyChatTaskFunc(taskId: number, func: (taskId: number) => void): void {
  tasks.setFunc(taskId, func);
  tasks.data(taskId)[EZCHAT_TASK_STATE] = 0;
}

/** Task_InitEasyChat (easy_chat_2.c). */
function Task_InitEasyChat(taskId: number): void {
  if (!IsUpdateLinkStateCBActive()) {
    while (Task_InitEasyChatInternal(taskId));
  } else if (Task_InitEasyChatInternal(taskId)) {
    return;
  }
  SetEasyChatTaskFunc(taskId, Task_RunEasyChat);
}

/** Task_RunEasyChat (easy_chat_2.c). */
function Task_RunEasyChat(taskId: number): void {
  const data = tasks.data(taskId);
  switch (data[EZCHAT_TASK_STATE]) {
    case 0:
      SetVBlankCallback(VBlankCallback_EasyChatScreen);
      BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
      BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
      data[EZCHAT_TASK_STATE]++;
      break;
    case 1: {
      const action = EasyChatScreen_HandleJoypad();
      if (action === 23) {
        BeginNormalPaletteFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
        data[EZCHAT_TASK_STATE] = 3;
      } else if (action !== 0) {
        sound.playSE(C.SE_SELECT);
        EasyChatInterfaceCommand_Setup(action);
        data[EZCHAT_TASK_STATE]++;
      }
      break;
    }
    case 2:
      if (!EasyChatInterfaceCommand_Run()) data[EZCHAT_TASK_STATE] = 1;
      break;
    case 3:
      if (!gPaletteFade.active) {
        if (data[EZCHAT_TASK_TYPE] === C.EASY_CHAT_TYPE_QUESTIONNAIRE) CompareQuestionnaireResponseWithPassphrase();
        if (data[EZCHAT_TASK_TYPE] === C.EASY_CHAT_TYPE_PROFILE) {
          flagSet(C.FLAG_SYS_SET_TRAINER_CARD_PROFILE);
          CompareProfileResponseWithPassphrase();
        }
        tasks.destroy(taskId);
        DismantleEasyChat(sExitCallback);
      }
      break;
  }
}

/** Task_InitEasyChatInternal (easy_chat_2.c). */
function Task_InitEasyChatInternal(taskId: number): boolean {
  const data = tasks.data(taskId);
  switch (data[EZCHAT_TASK_STATE]) {
    case 0:
      SetVBlankCallback(null);
      ResetSpriteData();
      FreeAllSpritePalettes();
      ResetPaletteFade();
      break;
    case 1:
      if (!InitEasyChatSelection()) DismantleEasyChat(sExitCallback);
      break;
    case 2:
      if (!EasyChat_AllocateResources(data[EZCHAT_TASK_TYPE], taskWords)) DismantleEasyChat(sExitCallback);
      break;
    case 3:
      if (!InitEasyChatGraphicsWork()) DismantleEasyChat(sExitCallback);
      break;
    case 4:
      if (LoadEasyChatGraphics()) return true;
      break;
    default:
      return false;
  }
  data[EZCHAT_TASK_STATE]++;
  return true;
}

/** DismantleEasyChat (easy_chat_2.c): SetMainCallback2(callback) is the exit of the hardware scene. */
function DismantleEasyChat(callback: (() => void) | null): void {
  DestroyEasyChatSelectionData();
  EasyChat_FreeResources();
  DestroyEasyChatGraphicsResources();
  FreeAllWindowBuffers();
  sScene?.leave();
  sScene = null;
  if (sGame) sGame.scene = null;
  callback?.();
}

/** ShowEasyChatScreen (easy_chat_2.c). `questionnaireWords` is GetQuestionnaireWordsPtr() (mystery_gift.c, link scope). */
export function ShowEasyChatScreen(game: Game, questionnaireWords: number[] = new Array(C.NUM_QUESTIONNAIRE_WORDS).fill(EC_WORD_UNDEFINED)): void {
  const type = varGet(SV.x8004);
  let words: number[];
  switch (type) {
    case C.EASY_CHAT_TYPE_PROFILE: words = save.easyChatProfile; break;
    case C.EASY_CHAT_TYPE_BATTLE_START: words = save.easyChatBattleStart; break;
    case C.EASY_CHAT_TYPE_BATTLE_WON: words = save.easyChatBattleWon; break;
    case C.EASY_CHAT_TYPE_BATTLE_LOST: words = save.easyChatBattleLost; break;
    case C.EASY_CHAT_TYPE_QUESTIONNAIRE: words = questionnaireWords; break;
    case C.EASY_CHAT_TYPE_MAIL: words = save.mail[varGet(SV.x8005)].words; break;
    default: return;
  }
  DoEasyChatScreen(game, type, words, () => game.CB2_ReturnToFieldContinueScript());
}

/** CompareProfileResponseWithPassphrase (easy_chat_2.c). */
function CompareProfileResponseWithPassphrase(): void {
  varSet(SV.x8004, IsPhraseDifferentThanPlayerInput(cdata<number[]>("easy_chat_2", "sECPhrase_MysteryEventIsExciting"), 4) ? 1 : 0);
}

/** CompareQuestionnaireResponseWithPassphrase (easy_chat_2.c). */
function CompareQuestionnaireResponseWithPassphrase(): void {
  varSet(SV.x8004, IsPhraseDifferentThanPlayerInput(cdata<number[]>("easy_chat_2", "sECPhrase_LinkTogetherWithAll"), 4) ? 1 : 0);
}

/** EasyChat_AllocateResources (easy_chat_2.c). */
function EasyChat_AllocateResources(type: number, words: number[]): boolean {
  const templateId = GetEasyChatScreenTemplateId(type);
  const template = templates()[templateId];
  const screen: EasyChatScreen = {
    type, words, state: 0, mainCursorColumn: 0, mainCursorRow: 0, isAlphaMode: false,
    numColumns: template.numColumns, numRows: template.numRows, numWords: template.numColumns * template.numRows,
    templateId, stateBackup: 0, selectGroupCursorX: 0, selectGroupCursorY: 0, selectGroupRowsAbove: 0,
    selectGroupNumRows: 0, selectWordRowsAbove: 0, selectWordNumRows: 0, selectWordCursorX: 0, selectWordCursorY: 0,
    ecWordBuffer: new Array(9).fill(0),
  };
  if (screen.numWords > 9) screen.numWords = 9;
  for (let i = 0; i < screen.numWords; i++) screen.ecWordBuffer[i] = words[i] ?? EC_WORD_UNDEFINED;
  screen.selectGroupNumRows = Math.trunc((GetNumDisplayableGroups() - 1) / 2) + 1;
  sEasyChatScreen = screen;
  return true;
}

/** EasyChat_FreeResources (easy_chat_2.c). */
function EasyChat_FreeResources(): void {
  sEasyChatScreen = null;
}

/** EasyChatScreen_HandleJoypad (easy_chat_2.c). */
function EasyChatScreen_HandleJoypad(): number {
  switch (S().state) {
    case 0: return HandleJoypad_SelectField();
    case 1: return HandleJoypad_SelectFooter();
    case 2: return HandleJoypad_SelectGroup();
    case 3: return HandleJoypad_SelectWord();
    case 4: return Cancel_HandleYesNoMenu();
    case 5: return DelAll_HandleYesNoMenu();
    case 6: return Confirm_HandleYesNoMenu();
  }
  return 0;
}

const JOY_NEW = (bits: number): boolean => (joy.newKeys & bits) !== 0;
const JOY_REPT = (bits: number): boolean => (joy.repeated & bits) !== 0;

/** HandleJoypad_SelectField (easy_chat_2.c). */
function HandleJoypad_SelectField(): number {
  const s = S();
  if (JOY_NEW(A_BUTTON)) {
    s.state = 2;
    s.selectGroupCursorX = 0;
    s.selectGroupCursorY = 0;
    s.selectGroupRowsAbove = 0;
    return 9;
  } else if (JOY_NEW(B_BUTTON)) {
    return Cancel_CreateYesNoMenu();
  } else if (JOY_NEW(START_BUTTON)) {
    return Confirm_CreateYesNoMenu();
  } else if (JOY_NEW(DPAD_UP)) {
    s.mainCursorRow--;
  } else if (JOY_NEW(DPAD_LEFT)) {
    s.mainCursorColumn--;
  } else if (JOY_NEW(DPAD_DOWN)) {
    s.mainCursorRow++;
  } else if (JOY_NEW(DPAD_RIGHT)) {
    s.mainCursorColumn++;
  } else {
    return 0;
  }
  const template = tpl();
  if (s.mainCursorRow < 0) s.mainCursorRow = template.numRows;
  if (s.mainCursorRow > template.numRows) s.mainCursorRow = 0;
  if (s.mainCursorRow === template.numRows) {
    if (s.mainCursorColumn > 2) s.mainCursorColumn = 2;
    s.state = 1;
    return 3;
  }
  if (s.mainCursorColumn < 0) s.mainCursorColumn = template.numColumns - 1;
  if (s.mainCursorColumn >= template.numColumns) s.mainCursorColumn = 0;
  if (GetEasyChatScreenFrameId() === 2 && s.mainCursorColumn === 1 && s.mainCursorRow === 4) s.mainCursorColumn = 0;
  return 2;
}

/** HandleJoypad_SelectFooter (easy_chat_2.c). */
function HandleJoypad_SelectFooter(): number {
  const s = S();
  if (JOY_NEW(A_BUTTON)) {
    switch (s.mainCursorColumn) {
      case 0: return DelAll_CreateYesNoMenu();
      case 1: return Cancel_CreateYesNoMenu();
      case 2: return Confirm_CreateYesNoMenu();
    }
  }
  if (JOY_NEW(B_BUTTON)) {
    return Cancel_CreateYesNoMenu();
  } else if (JOY_NEW(START_BUTTON)) {
    return Confirm_CreateYesNoMenu();
  } else if (JOY_NEW(DPAD_UP)) {
    s.mainCursorRow--;
  } else if (JOY_NEW(DPAD_LEFT)) {
    s.mainCursorColumn--;
  } else if (JOY_NEW(DPAD_DOWN)) {
    s.mainCursorRow = 0;
  } else if (JOY_NEW(DPAD_RIGHT)) {
    s.mainCursorColumn++;
  } else {
    return 0;
  }
  const template = tpl();
  if (s.mainCursorRow === template.numRows) {
    if (s.mainCursorColumn < 0) s.mainCursorColumn = 2;
    if (s.mainCursorColumn >= 3) s.mainCursorColumn = 0;
    return 3;
  }
  if (s.mainCursorColumn >= template.numColumns) s.mainCursorColumn = template.numColumns - 1;
  if (GetEasyChatScreenFrameId() === 2 && s.mainCursorColumn === 1 && s.mainCursorRow === 4) s.mainCursorColumn = 0;
  s.state = 0;
  return 2;
}

/** HandleJoypad_SelectGroup (easy_chat_2.c). */
function HandleJoypad_SelectGroup(): number {
  const s = S();
  if (JOY_NEW(B_BUTTON)) return BackOutFromGroupToFieldSelect();
  if (JOY_NEW(A_BUTTON)) {
    if (s.selectGroupCursorX !== -1) return OpenSelectedGroup();
    switch (s.selectGroupCursorY) {
      case 0: return ToggleGroupAlphaMode();
      case 1: return DeleteSelectedWord();
      case 2: return BackOutFromGroupToFieldSelect();
    }
  }
  if (JOY_NEW(SELECT_BUTTON)) return ToggleGroupAlphaMode();
  if (JOY_REPT(DPAD_UP)) return SelectGroupCursorAction(2);
  if (JOY_REPT(DPAD_DOWN)) return SelectGroupCursorAction(3);
  if (JOY_REPT(DPAD_LEFT)) return SelectGroupCursorAction(1);
  if (JOY_REPT(DPAD_RIGHT)) return SelectGroupCursorAction(0);
  return 0;
}

/** HandleJoypad_SelectWord (easy_chat_2.c). */
function HandleJoypad_SelectWord(): number {
  if (JOY_NEW(B_BUTTON)) {
    S().state = 2;
    return 13;
  }
  if (JOY_NEW(A_BUTTON)) return PlaceSelectedWord();
  if (JOY_NEW(START_BUTTON)) return SelectWordCursorAction(4);
  if (JOY_NEW(SELECT_BUTTON)) return SelectWordCursorAction(5);
  if (JOY_REPT(DPAD_UP)) return SelectWordCursorAction(2);
  if (JOY_REPT(DPAD_DOWN)) return SelectWordCursorAction(3);
  if (JOY_REPT(DPAD_LEFT)) return SelectWordCursorAction(1);
  if (JOY_REPT(DPAD_RIGHT)) return SelectWordCursorAction(0);
  return 0;
}

/** Cancel_HandleYesNoMenu (easy_chat_2.c). */
function Cancel_HandleYesNoMenu(): number {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case C.MENU_B_PRESSED:
    case 1: // No
      S().state = GetStateBackup();
      return 7;
    case 0: // Yes
      varSet(SV.RESULT, 0);
      return 23;
    default:
      return 0;
  }
}

/** Confirm_HandleYesNoMenu (easy_chat_2.c). */
function Confirm_HandleYesNoMenu(): number {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case C.MENU_B_PRESSED:
    case 1: // No
      S().state = GetStateBackup();
      return 7;
    case 0: // Yes
      varSet(SV.RESULT, HasECMessageChanged() ? 1 : 0);
      CommitECWords();
      return 23;
    default:
      return 0;
  }
}

/** DelAll_HandleYesNoMenu (easy_chat_2.c). */
function DelAll_HandleYesNoMenu(): number {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case C.MENU_B_PRESSED:
    case 1: // No
      S().state = 1;
      return 7;
    case 0: // Yes
      DeleteAllECFields();
      S().state = 1;
      return 8;
    default:
      return 0;
  }
}

/** Cancel_CreateYesNoMenu (easy_chat_2.c). */
function Cancel_CreateYesNoMenu(): number {
  S().stateBackup = S().state;
  S().state = 4;
  return 5;
}

/** DelAll_CreateYesNoMenu (easy_chat_2.c). */
function DelAll_CreateYesNoMenu(): number {
  S().stateBackup = S().state;
  S().state = 5;
  return 4;
}

/** Confirm_CreateYesNoMenu (easy_chat_2.c). */
function Confirm_CreateYesNoMenu(): number {
  S().stateBackup = S().state;
  if (IsEcWordBufferUninitialized()) {
    S().state = 4;
    return 5;
  }
  S().state = 6;
  return 6;
}

/** GetStateBackup (easy_chat_2.c). */
function GetStateBackup(): number {
  return S().stateBackup;
}

/** OpenSelectedGroup (easy_chat_2.c). */
function OpenSelectedGroup(): number {
  const s = S();
  if (!s.isAlphaMode) {
    const groupId = GetSelectedGroupByIndex(GetSelectedGroupIndex());
    GetUnlockedECWords(false, groupId);
  } else {
    GetUnlockedECWords(true, GetSelectedLetter());
  }
  const numDisplayedWords = GetNumDisplayedWords();
  if (numDisplayedWords === 0) return 0;
  s.selectWordNumRows = Math.trunc((numDisplayedWords - 1) / 2);
  s.selectWordRowsAbove = 0;
  s.selectWordCursorX = 0;
  s.selectWordCursorY = 0;
  s.state = 3;
  return 11;
}

/** BackOutFromGroupToFieldSelect (easy_chat_2.c). */
function BackOutFromGroupToFieldSelect(): number {
  S().state = 0;
  return 10;
}

/** ToggleGroupAlphaMode (easy_chat_2.c). */
function ToggleGroupAlphaMode(): number {
  const s = S();
  s.selectGroupCursorX = 0;
  s.selectGroupCursorY = 0;
  s.selectGroupRowsAbove = 0;
  s.isAlphaMode = !s.isAlphaMode;
  return 22;
}

/** DeleteSelectedWord (easy_chat_2.c). */
function DeleteSelectedWord(): number {
  SetEasyChatWordToField(0xffff);
  return 1;
}

/** PlaceSelectedWord (easy_chat_2.c). */
function PlaceSelectedWord(): number {
  const easyChatWord = GetDisplayedWordByIndex(GetSelectWordCursorPos());
  SetEasyChatWordToField(easyChatWord);
  S().state = 0;
  return 12;
}

/** CommitECWords (easy_chat_2.c). */
function CommitECWords(): void {
  const s = S();
  for (let i = 0; i < s.numWords; i++) s.words[i] = s.ecWordBuffer[i];
}

/** DeleteAllECFields (easy_chat_2.c). */
function DeleteAllECFields(): void {
  const s = S();
  for (let i = 0; i < s.numWords; i++) s.ecWordBuffer[i] = 0xffff;
}

/** SetEasyChatWordToField (easy_chat_2.c). */
function SetEasyChatWordToField(easyChatWord: number): void {
  S().ecWordBuffer[GetSelectedFieldIndex()] = easyChatWord;
}

/** HasECMessageChanged (easy_chat_2.c). */
function HasECMessageChanged(): boolean {
  const s = S();
  for (let i = 0; i < s.numWords; i++) if (s.ecWordBuffer[i] !== s.words[i]) return true;
  return false;
}

/** SelectGroupCursorAction (easy_chat_2.c). */
function SelectGroupCursorAction(action: number): number {
  const s = S();
  if (s.selectGroupCursorX !== -1) {
    if (!s.isAlphaMode) return UpdateSelectGroupCursorPos_OutsideBlueBox_GroupMode(action);
    return UpdateSelectGroupCursorPos_OutsideBlueBox_AlphaMode(action);
  }
  return UpdateSelectGroupCursorPos_InsideBlueBox(action);
}

/** UpdateSelectGroupCursorPos_OutsideBlueBox_GroupMode (easy_chat_2.c). */
function UpdateSelectGroupCursorPos_OutsideBlueBox_GroupMode(arg0: number): number {
  const s = S();
  switch (arg0) {
    case 2:
      if (s.selectGroupCursorY !== -s.selectGroupRowsAbove) {
        if (s.selectGroupCursorY) {
          s.selectGroupCursorY--;
          return 14;
        }
        s.selectGroupRowsAbove--;
        return 16;
      }
      break;
    case 3:
      if (s.selectGroupCursorY + s.selectGroupRowsAbove < s.selectGroupNumRows - 1) {
        let var0: number;
        if (s.selectGroupCursorY < 3) {
          s.selectGroupCursorY++;
          var0 = 14;
        } else {
          s.selectGroupRowsAbove++;
          var0 = 15;
        }
        MoveGroupCursorXToMaxCol();
        return var0;
      }
      break;
    case 1:
      if (s.selectGroupCursorX) s.selectGroupCursorX--;
      else GroupCursorMoveToBlueBox();
      return 14;
    case 0:
      if (s.selectGroupCursorX < 1) {
        s.selectGroupCursorX++;
        if (GroupSelectCursorXPosTooFarRight()) GroupCursorMoveToBlueBox();
      } else {
        GroupCursorMoveToBlueBox();
      }
      return 14;
  }
  return 0;
}

/** UpdateSelectGroupCursorPos_OutsideBlueBox_AlphaMode (easy_chat_2.c). */
function UpdateSelectGroupCursorPos_OutsideBlueBox_AlphaMode(arg0: number): number {
  const s = S();
  switch (arg0) {
    case 2:
      if (s.selectGroupCursorY > 0) s.selectGroupCursorY--;
      else s.selectGroupCursorY = 3;
      MoveGroupCursorXToMaxCol();
      return 14;
    case 3:
      if (s.selectGroupCursorY < 3) s.selectGroupCursorY++;
      else s.selectGroupCursorY = 0;
      MoveGroupCursorXToMaxCol();
      return 14;
    case 0:
      s.selectGroupCursorX++;
      if (GroupSelectCursorXPosTooFarRight()) GroupCursorMoveToBlueBox();
      return 14;
    case 1:
      s.selectGroupCursorX--;
      if (s.selectGroupCursorX < 0) GroupCursorMoveToBlueBox();
      return 14;
  }
  return 0;
}

/** UpdateSelectGroupCursorPos_InsideBlueBox (easy_chat_2.c). */
function UpdateSelectGroupCursorPos_InsideBlueBox(arg0: number): number {
  const s = S();
  switch (arg0) {
    case 2:
      if (s.selectGroupCursorY) s.selectGroupCursorY--;
      else s.selectGroupCursorY = 2;
      return 14;
    case 3:
      if (s.selectGroupCursorY < 2) s.selectGroupCursorY++;
      else s.selectGroupCursorY = 0;
      return 14;
    case 1:
      s.selectGroupCursorY++;
      GroupCursorWrapAroundLeft();
      return 14;
    case 0:
      s.selectGroupCursorX = 0;
      s.selectGroupCursorY++;
      return 14;
  }
  return 0;
}

/** GroupCursorMoveToBlueBox (easy_chat_2.c): selectGroupCursorX = 0xFF is -1 as an s8. */
function GroupCursorMoveToBlueBox(): void {
  const s = S();
  s.selectGroupCursorX = -1;
  if (s.selectGroupCursorY) s.selectGroupCursorY--;
}

/** GroupCursorWrapAroundLeft (easy_chat_2.c). */
function GroupCursorWrapAroundLeft(): void {
  const s = S();
  if (!s.isAlphaMode) {
    s.selectGroupCursorX = 1;
    MoveGroupCursorXToMaxCol();
  } else {
    s.selectGroupCursorX = GetMaxGroupCursorXinAlphaMode(s.selectGroupCursorY);
  }
}

/** SelectWordCursorAction (easy_chat_2.c). */
function SelectWordCursorAction(arg0: number): number {
  const s = S();
  let result: number;
  switch (arg0) {
    case 2: // up
      if (s.selectWordCursorY + s.selectWordRowsAbove > 0) {
        if (s.selectWordCursorY > 0) {
          s.selectWordCursorY--;
          result = 17;
        } else {
          s.selectWordRowsAbove--;
          result = 18;
        }
        MoveWordCursorXToMaxCol();
        return result;
      }
      break;
    case 3: // down
      if (s.selectWordCursorY + s.selectWordRowsAbove < s.selectWordNumRows) {
        if (s.selectWordCursorY < 3) {
          s.selectWordCursorY++;
          result = 17;
        } else {
          s.selectWordRowsAbove++;
          result = 19;
        }
        MoveWordCursorXToMaxCol();
        return result;
      }
      break;
    case 1: // left
      if (s.selectWordCursorX > 0) s.selectWordCursorX--;
      else s.selectWordCursorX = 1;
      MoveWordCursorXToMaxCol();
      return 17;
    case 0: // right
      if (s.selectWordCursorX < 1) {
        s.selectWordCursorX++;
        if (WordSelectCursorXPosTooFarRight()) s.selectWordCursorX = 0;
      } else {
        s.selectWordCursorX = 0;
      }
      return 17;
    case 4: // pg up
      if (s.selectWordRowsAbove) {
        if (s.selectWordRowsAbove > 3) s.selectWordRowsAbove -= 4;
        else s.selectWordRowsAbove = 0;
        return 20;
      }
      break;
    case 5: // pg dn
      if (s.selectWordRowsAbove <= s.selectWordNumRows - 4) {
        s.selectWordRowsAbove += 4;
        if (s.selectWordRowsAbove > s.selectWordNumRows - 3) s.selectWordRowsAbove = (s.selectWordNumRows - 3) & 0xff;
        MoveWordCursorXToMaxCol();
        return 21;
      }
      break;
  }
  return 0;
}

/** GetSelectedFieldIndex (easy_chat_2.c). */
function GetSelectedFieldIndex(): number {
  return S().mainCursorRow * S().numColumns + S().mainCursorColumn;
}

/** GetSelectedGroupIndex (easy_chat_2.c). */
function GetSelectedGroupIndex(): number {
  const s = S();
  return 2 * (s.selectGroupCursorY + s.selectGroupRowsAbove) + s.selectGroupCursorX;
}

/** GetSelectedLetter (easy_chat_2.c). */
function GetSelectedLetter(): number {
  const s = S();
  const col = s.selectGroupCursorX < NELEMS_ALPHABET_COLUMNS ? s.selectGroupCursorX : 0;
  const row = s.selectGroupCursorY < sAlphabetLayout.length ? s.selectGroupCursorY : 0;
  return sAlphabetLayout[row][col];
}

/** GetSelectWordCursorPos (easy_chat_2.c). */
function GetSelectWordCursorPos(): number {
  const s = S();
  return 2 * (s.selectWordCursorY + s.selectWordRowsAbove) + s.selectWordCursorX;
}

/** GetMaxGroupCursorXinAlphaMode (easy_chat_2.c). */
function GetMaxGroupCursorXinAlphaMode(arg0: number): number {
  return arg0 === 1 ? 5 : 6;
}

/** MoveGroupCursorXToMaxCol (easy_chat_2.c). */
function MoveGroupCursorXToMaxCol(): void {
  const s = S();
  while (GroupSelectCursorXPosTooFarRight()) {
    if (s.selectGroupCursorX) s.selectGroupCursorX--;
    else break;
  }
}

/** MoveWordCursorXToMaxCol (easy_chat_2.c). */
function MoveWordCursorXToMaxCol(): void {
  const s = S();
  while (WordSelectCursorXPosTooFarRight()) {
    if (s.selectWordCursorX) s.selectWordCursorX--;
    else break;
  }
}

/** GroupSelectCursorXPosTooFarRight (easy_chat_2.c). */
function GroupSelectCursorXPosTooFarRight(): boolean {
  const s = S();
  if (!s.isAlphaMode) return GetSelectedGroupIndex() >= GetNumDisplayableGroups();
  return s.selectGroupCursorX > GetMaxGroupCursorXinAlphaMode(s.selectGroupCursorY);
}

/** WordSelectCursorXPosTooFarRight (easy_chat_2.c). */
function WordSelectCursorXPosTooFarRight(): boolean {
  return GetSelectWordCursorPos() >= GetNumDisplayedWords();
}

/** GetEasyChatScreenFrameId (easy_chat_2.c). */
export function GetEasyChatScreenFrameId(): number {
  return tpl().frameId;
}

/** GetTitleText (easy_chat_2.c): null for NULL. */
export function GetTitleText(): Uint8Array | null {
  return text(tpl().titleText);
}

/** GetEasyChatWordBuffer (easy_chat_2.c). */
export function GetEasyChatWordBuffer(): number[] {
  return S().ecWordBuffer;
}

/** GetNumRows (easy_chat_2.c). */
export function GetNumRows(): number {
  return S().numRows;
}

/** GetNumColumns (easy_chat_2.c). */
export function GetNumColumns(): number {
  return S().numColumns;
}

/** GetMainCursorColumn (easy_chat_2.c). */
export function GetMainCursorColumn(): number {
  return S().mainCursorColumn;
}

/** GetMainCursorRow (easy_chat_2.c). */
export function GetMainCursorRow(): number {
  return S().mainCursorRow;
}

/** GetEasyChatInstructionsText (easy_chat_2.c). */
export function GetEasyChatInstructionsText(): [Uint8Array | null, Uint8Array | null] {
  return [text(tpl().instructionsText1), text(tpl().instructionsText2)];
}

/** GetEasyChatConfirmText (easy_chat_2.c). */
export function GetEasyChatConfirmText(): [Uint8Array | null, Uint8Array | null] {
  return [text(tpl().confirmText1), text(tpl().confirmText2)];
}

/** GetEasyChatConfirmCancelText (easy_chat_2.c). */
export function GetEasyChatConfirmCancelText(): [Uint8Array | null, Uint8Array | null] {
  switch (S().type) {
    case C.EASY_CHAT_TYPE_MAIL: return [rom.text("gText_StopGivingPkmnMail"), null];
    default: return [rom.text("gText_QuitEditing"), null];
  }
}

/** GetEasyChatConfirmDeletionText (easy_chat_2.c). */
export function GetEasyChatConfirmDeletionText(): [Uint8Array | null, Uint8Array | null] {
  return [rom.text("gText_AllTextBeingEditedWill"), rom.text("gText_BeDeletedThatOkay")];
}

/** GetECSelectGroupCursorCoords (easy_chat_2.c): u8 out-parameters (-1 reads back as 0xFF and is cast to s8 by the callers). */
export function GetECSelectGroupCursorCoords(): [number, number] {
  return [S().selectGroupCursorX, S().selectGroupCursorY];
}

/** IsEasyChatAlphaMode (easy_chat_2.c). */
export function IsEasyChatAlphaMode(): boolean {
  return S().isAlphaMode;
}

/** GetECSelectGroupRowsAbove (easy_chat_2.c). */
export function GetECSelectGroupRowsAbove(): number {
  return S().selectGroupRowsAbove;
}

/** GetECSelectWordCursorCoords (easy_chat_2.c). */
export function GetECSelectWordCursorCoords(): [number, number] {
  return [S().selectWordCursorX, S().selectWordCursorY];
}

/** GetECSelectWordRowsAbove (easy_chat_2.c). */
export function GetECSelectWordRowsAbove(): number {
  return S().selectWordRowsAbove;
}

/** GetECSelectWordNumRows (easy_chat_2.c). */
export function GetECSelectWordNumRows(): number {
  return S().selectWordNumRows;
}

/** UnusedDummy (easy_chat_2.c). */
export function UnusedDummy(): number {
  return 0;
}

/** ShouldDrawECUpArrow (easy_chat_2.c). */
export function ShouldDrawECUpArrow(): boolean {
  const s = S();
  switch (s.state) {
    case 2:
      if (!s.isAlphaMode && s.selectGroupRowsAbove !== 0) return true;
      break;
    case 3:
      if (s.selectWordRowsAbove !== 0) return true;
      break;
  }
  return false;
}

/** ShouldDrawECDownArrow (easy_chat_2.c). */
export function ShouldDrawECDownArrow(): boolean {
  const s = S();
  switch (s.state) {
    case 2:
      if (!s.isAlphaMode && s.selectGroupRowsAbove + 4 <= s.selectGroupNumRows - 1) return true;
      break;
    case 3:
      if (s.selectWordRowsAbove + 4 <= s.selectWordNumRows) return true;
      break;
  }
  return false;
}

/** IsPhraseDifferentThanPlayerInput (easy_chat_2.c). */
function IsPhraseDifferentThanPlayerInput(phrase: number[], phraseLength: number): boolean {
  for (let i = 0; i < phraseLength; i++) if (phrase[i] !== S().ecWordBuffer[i]) return true;
  return false;
}

/** GetEasyChatScreenTemplateId (easy_chat_2.c). */
function GetEasyChatScreenTemplateId(type: number): number {
  const list = templates();
  for (let i = 0; i < list.length; i++) if (list[i].type === type) return i;
  return 0;
}

/** IsEcWordBufferUninitialized (easy_chat_2.c). */
function IsEcWordBufferUninitialized(): boolean {
  const s = S();
  for (let i = 0; i < s.numWords; i++) if (s.ecWordBuffer[i] !== 0xffff) return false;
  return true;
}
