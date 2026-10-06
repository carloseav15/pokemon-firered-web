// Port of scrcmd.c. Each command reads its arguments from the original
// assembled bytecode exactly as the C implementation does. Functions keep
// the ScrCmd_ names so COMMANDS can be indexed directly by the ROM's
// gScriptCmdTable symbol names (rom.scriptMeta.commands).

import { FONT_BRAILLE, GetStringWidth } from "../gba/font";
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { concat, copy, countDigits, encode, intToDecimal, length, stringVars, STR_CONV_MODE_LEFT_ALIGN, EOS } from "../gba/charmap";
import { paletteFade } from "../gba/fade";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_HELD, JOY_NEW, L_BUTTON, R_BUTTON, SELECT_BUTTON, START_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { b64, RAM_SCRIPT_BASE, rom, type MapHeader } from "../rom";
import { random } from "../random";
import { flagClear, flagGet, flagSet, GetGameStat, incrementGameStat, save, SV, varGet, varSet } from "../save";
import { MAP_OFFSET, MapGridSetMetatileIdAt, MAPGRID_COLLISION_MASK } from "../field/fieldmap";
import { LOCALID_PLAYER, OBJECT_EVENTS_COUNT, OPPOSITE } from "../field/objectEvents";
import * as items from "../pokemon/items";
import { getBoxName } from "../pokemon/storage";
import { knowsMove, leadMonIndex, nickname, setMoveSlot, speciesName } from "../pokemon/pokemon";
import { runSpecial } from "./specials";
import { gQuestLogState, QL_GetPlaybackState, QuestLog_RecordEnteredMap } from "../questLogEvents";
import { ClearPlayerHeldMovementAndUnfreezeObjectEvents, FreezeObjects_WaitForPlayer, FreezeObjects_WaitForPlayerAndSelected } from "./eventObjectLock";
import { MapPreview_SetFlag } from "../mapPreviewScreen";
import { DestroyHelpMessageWindow, DrawHelpMessageWindowWithText } from "../menus/helpMessage";
import type { ScriptCommand, ScriptRunner } from "./context";
import {
  ClearQuestLogInput, ClearQuestLogInputIsDpadFlag, ClearRamScript, GetSavedRamScriptIfValid,
  gRamScriptRetAddr, ramScriptDataBytes, RegisterQuestLogInput, setRamScriptRetAddr, SetQuestLogInputIsDpadFlag,
} from "./context";

const CONDITION_TABLE = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [0, 1, 1],
  [1, 0, 1],
];

function compare(a: number, b: number): number {
  return a < b ? 0 : a === b ? 1 : 2;
}

function cond(ctx: ScriptRunner, condition: number): boolean {
  return CONDITION_TABLE[condition]?.[ctx.comparisonResult] === 1;
}

function stdScript(index: number): number {
  return rom.scriptMeta.std[index] ?? 0;
}

function stringVarSet(index: number, value: Uint8Array): void {
  if (index === 0) stringVars.var1 = value;
  else if (index === 1) stringVars.var2 = value;
  else stringVars.var3 = value;
}

function stringVarGet(index: number): Uint8Array {
  return index === 0 ? stringVars.var1 : index === 1 ? stringVars.var2 : stringVars.var3;
}

/** Read a pointer that may be NULL (then use ctx->data[0]). */
function textPtr(ctx: ScriptRunner): number {
  const ptr = ctx.ScriptReadWord();
  return ptr || ctx.data[0];
}

function localIdObject(ctx: ScriptRunner, localId: number) {
  return ctx.ow.objects.byLocalIdAndMap(localId, save.location.mapNum, save.location.mapGroup);
}

/** Map-qualified commands encode the group before the map number. */
function readObjectAt(ctx: ScriptRunner) {
  const localId = varGet(ctx.ScriptReadHalfword());
  const mapGroup = ctx.readByte();
  const mapNum = ctx.readByte();
  return ctx.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup);
}

function selected(ctx: ScriptRunner) {
  return ctx.ow.objects.objects[ctx.ow.selectedObject] ?? undefined;
}

// Movement script driver shared by applymovement/waitmovement.
let movingNpcId = 0;
let pauseCounter = 0;
let fieldEffectScriptId = 0;
let addressOffset = 0;
// ScrCmd_waitbuttonpress (scrcmd.c): sQuestLogWaitButtonPressTimer.
let questLogWaitButtonPressTimer = 0;

/** IsPaletteNotActive, RunPauseTimer and the wait callbacks from scrcmd.c. */
function IsPaletteNotActive(): boolean { return !paletteFade.active; }
function RunPauseTimer(): boolean { pauseCounter = (pauseCounter - 1) & 0xffff; return pauseCounter === 0; }
function WaitForSoundEffectFinish(): boolean { return !sound.isSEPlaying(); }
function WaitForFanfareFinish(): boolean { return sound.isFanfareTaskInactive(); }
function WaitForMovementFinish(ctx: ScriptRunner, localId: number, mapNum: number, mapGroup: number): boolean {
  return ctx.ow.game.scriptMovement.isFinished(ctx.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup));
}
function IsDoorAnimationStopped(ctx: ScriptRunner): boolean { return !ctx.ow.doors.FieldIsDoorAnimationRunning(); }
function WaitForFieldEffectFinish(ctx: ScriptRunner, effectId: number): boolean { return !ctx.ow.effects.active.has(effectId); }
function WaitForAorBPress(ctx: ScriptRunner): boolean {
  if (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)) return true;
  if (ScriptContext_NextCommandEndsScript(ctx)) {
    const qlogInput = ScriptContext_GetQuestLogInput();
    RegisterQuestLogInput(qlogInput);
    if (qlogInput !== C.QL_INPUT_OFF && gQuestLogState !== C.QL_STATE_PLAYBACK) {
      ctx.ow.control.ClearMsgBoxCancelableState();
      if (qlogInput !== C.QL_INPUT_A && qlogInput !== C.QL_INPUT_B) SetQuestLogInputIsDpadFlag();
      else { ClearQuestLogInput(); ClearQuestLogInputIsDpadFlag(); }
      return true;
    }
  }
  if (QL_GetPlaybackState() === C.QL_PLAYBACK_STATE_RUNNING || gQuestLogState === C.QL_STATE_PLAYBACK) {
    if (questLogWaitButtonPressTimer === 120) return true;
    questLogWaitButtonPressTimer++;
  }
  return false;
}

/** ScriptSetMonMoveSlot (script_pokemon_util.c); scrcmd.c stores the slot
 * before the move id, while the C helper receives the move id first. */
function ScriptSetMonMoveSlot(monIndex: number, move: number, slot: number): void {
  if (monIndex > C.PARTY_SIZE) monIndex = save.party.length - 1;
  const mon = save.party[monIndex];
  if (mon) setMoveSlot(mon, move, slot);
}

/** ScriptContext_NextCommandEndsScript (scrcmd.c): peeks at the next opcode,
 * following a `return` to the caller's return address, and checks whether it
 * is releaseall (0x6b) or release (0x6c). */
function ScriptContext_NextCommandEndsScript(ctx: ScriptRunner): boolean {
  let ptr = ctx.scriptPtr;
  let nextCmd = rom.u8(ptr);
  if (nextCmd === 3) { // return
    ptr = ctx.stack[ctx.stack.length - 1];
    nextCmd = rom.u8(ptr);
  }
  return nextCmd >= 0x6b && nextCmd <= 0x6c; // releaseall or release
}

/** ScriptContext_GetQuestLogInput (scrcmd.c). */
function ScriptContext_GetQuestLogInput(): number {
  if (JOY_HELD(DPAD_UP) && varGet(SV.FACING) !== C.DIR_NORTH) return C.QL_INPUT_UP;
  if (JOY_HELD(DPAD_DOWN) && varGet(SV.FACING) !== C.DIR_SOUTH) return C.QL_INPUT_DOWN;
  if (JOY_HELD(DPAD_LEFT) && varGet(SV.FACING) !== C.DIR_WEST) return C.QL_INPUT_LEFT;
  if (JOY_HELD(DPAD_RIGHT) && varGet(SV.FACING) !== C.DIR_EAST) return C.QL_INPUT_RIGHT;
  if (JOY_NEW(L_BUTTON)) return C.QL_INPUT_L;
  if (JOY_HELD(R_BUTTON)) return C.QL_INPUT_R;
  if (JOY_HELD(START_BUTTON)) return C.QL_INPUT_START;
  if (JOY_HELD(SELECT_BUTTON)) return C.QL_INPUT_SELECT;
  if (JOY_NEW(A_BUTTON)) return C.QL_INPUT_A;
  if (JOY_NEW(B_BUTTON)) return C.QL_INPUT_B;
  return C.QL_INPUT_OFF;
}

function ScrCmd_nop(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_nop1(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_end(ctx: ScriptRunner): boolean { ctx.StopScript(); return false; }
function ScrCmd_return(ctx: ScriptRunner): boolean { ctx.ScriptReturn(); return false; }
function ScrCmd_call(ctx: ScriptRunner): boolean { const p = ctx.ScriptReadWord(); ctx.ScriptCall(p); return false; }
function ScrCmd_goto(ctx: ScriptRunner): boolean { ctx.ScriptJump(ctx.ScriptReadWord()); return false; }
function ScrCmd_goto_if(ctx: ScriptRunner): boolean { const c = ctx.readByte(); const p = ctx.ScriptReadWord(); if (cond(ctx, c)) ctx.ScriptJump(p); return false; }
function ScrCmd_call_if(ctx: ScriptRunner): boolean { const c = ctx.readByte(); const p = ctx.ScriptReadWord(); if (cond(ctx, c)) ctx.ScriptCall(p); return false; }
function ScrCmd_gotostd(ctx: ScriptRunner): boolean { const s = stdScript(ctx.readByte()); if (s) ctx.ScriptJump(s); return false; }
function ScrCmd_callstd(ctx: ScriptRunner): boolean { const s = stdScript(ctx.readByte()); if (s) ctx.ScriptCall(s); return false; }
function ScrCmd_gotostd_if(ctx: ScriptRunner): boolean { const c = ctx.readByte(); const s = stdScript(ctx.readByte()); if (cond(ctx, c) && s) ctx.ScriptJump(s); return false; }
function ScrCmd_callstd_if(ctx: ScriptRunner): boolean { const c = ctx.readByte(); const s = stdScript(ctx.readByte()); if (cond(ctx, c) && s) ctx.ScriptCall(s); return false; }
function ScrCmd_returnram(ctx: ScriptRunner): boolean { ctx.ScriptJump(gRamScriptRetAddr ?? 0); return false; }
function ScrCmd_endram(ctx: ScriptRunner): boolean { ClearRamScript(); ctx.StopScript(); return true; }
function ScrCmd_setmysteryeventstatus(ctx: ScriptRunner): boolean { ctx.readByte(); return false; }
function ScrCmd_trywondercardscript(ctx: ScriptRunner): boolean {
  const script = GetSavedRamScriptIfValid(ctx);
  if (script !== null) {
    setRamScriptRetAddr(ctx.scriptPtr);
    rom.setRamScriptBytes(ramScriptDataBytes());
    ctx.ScriptJump(RAM_SCRIPT_BASE + 4);
  }
  return false;
}
function ScrCmd_loadword(ctx: ScriptRunner): boolean { const i = ctx.readByte(); ctx.data[i] = ctx.ScriptReadWord(); return false; }
function ScrCmd_loadbyte(ctx: ScriptRunner): boolean { const i = ctx.readByte(); ctx.data[i] = ctx.readByte(); return false; }
function ScrCmd_loadbytefromptr(ctx: ScriptRunner): boolean { const i = ctx.readByte(); ctx.data[i] = rom.u8(ctx.ScriptReadWord()); return false; }
function ScrCmd_setptr(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.ScriptReadWord(); return false; }
function ScrCmd_setptrbyte(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.ScriptReadWord(); return false; }
function ScrCmd_copylocal(ctx: ScriptRunner): boolean { const d = ctx.readByte(); const s = ctx.readByte(); ctx.data[d] = ctx.data[s]; return false; }
function ScrCmd_copybyte(ctx: ScriptRunner): boolean { ctx.ScriptReadWord(); ctx.ScriptReadWord(); return false; }
function ScrCmd_setvar(ctx: ScriptRunner): boolean { const v = ctx.ScriptReadHalfword(); varSet(v, ctx.ScriptReadHalfword()); return false; }
function ScrCmd_copyvar(ctx: ScriptRunner): boolean { const d = ctx.ScriptReadHalfword(); const s = ctx.ScriptReadHalfword(); varSet(d, varGet(s)); return false; }
function ScrCmd_setorcopyvar(ctx: ScriptRunner): boolean { const d = ctx.ScriptReadHalfword(); varSet(d, varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_compare_local_to_local(ctx: ScriptRunner): boolean { const a = ctx.data[ctx.readByte()] & 0xff; const b = ctx.data[ctx.readByte()] & 0xff; ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_compare_local_to_value(ctx: ScriptRunner): boolean { const a = ctx.data[ctx.readByte()] & 0xff; const b = ctx.readByte(); ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_compare_local_to_ptr(ctx: ScriptRunner): boolean { const a = ctx.data[ctx.readByte()] & 0xff; const b = rom.u8(ctx.ScriptReadWord()); ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_compare_ptr_to_local(ctx: ScriptRunner): boolean { const a = rom.u8(ctx.ScriptReadWord()); const b = ctx.data[ctx.readByte()] & 0xff; ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_compare_ptr_to_value(ctx: ScriptRunner): boolean { const a = rom.u8(ctx.ScriptReadWord()); const b = ctx.readByte(); ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_compare_ptr_to_ptr(ctx: ScriptRunner): boolean { const a = rom.u8(ctx.ScriptReadWord()); const b = rom.u8(ctx.ScriptReadWord()); ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_compare_var_to_value(ctx: ScriptRunner): boolean { const a = varGet(ctx.ScriptReadHalfword()); const b = ctx.ScriptReadHalfword(); ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_compare_var_to_var(ctx: ScriptRunner): boolean { const a = varGet(ctx.ScriptReadHalfword()); const b = varGet(ctx.ScriptReadHalfword()); ctx.comparisonResult = compare(a, b); return false; }
function ScrCmd_addvar(ctx: ScriptRunner): boolean { const v = ctx.ScriptReadHalfword(); varSet(v, (varGet(v) + ctx.ScriptReadHalfword()) & 0xffff); return false; }
function ScrCmd_subvar(ctx: ScriptRunner): boolean { const v = ctx.ScriptReadHalfword(); varSet(v, (varGet(v) - varGet(ctx.ScriptReadHalfword())) & 0xffff); return false; }
function ScrCmd_random(ctx: ScriptRunner): boolean { const max = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, max ? random() % max : 0); return false; }
function ScrCmd_callnative(ctx: ScriptRunner): boolean {
  const ptr = ctx.ScriptReadWord();
  const name = rom.scriptMeta.externals[ptr - rom.scriptMeta.externBase];
  runSpecial(ctx, name);
  return false;
}
function ScrCmd_gotonative(ctx: ScriptRunner): boolean {
  const ptr = ctx.ScriptReadWord();
  const name = rom.scriptMeta.externals[ptr - rom.scriptMeta.externBase];
  ctx.SetupNativeScript(() => (runSpecial(ctx, name) ?? 1) !== 0);
  return true;
}
function ScrCmd_special(ctx: ScriptRunner): boolean {
  const index = ctx.ScriptReadHalfword();
  runSpecial(ctx, rom.scriptMeta.specials[index]);
  return false;
}
function ScrCmd_specialvar(ctx: ScriptRunner): boolean {
  const v = ctx.ScriptReadHalfword();
  const index = ctx.ScriptReadHalfword();
  const result = runSpecial(ctx, rom.scriptMeta.specials[index]);
  varSet(v, result ?? 0);
  return false;
}
function ScrCmd_waitstate(ctx: ScriptRunner): boolean { ctx.ow.script.ScriptContext_Stop(); return true; }
function ScrCmd_delay(ctx: ScriptRunner): boolean {
  pauseCounter = ctx.ScriptReadHalfword();
  ctx.SetupNativeScript(RunPauseTimer);
  return true;
}
function ScrCmd_setflag(ctx: ScriptRunner): boolean { flagSet(ctx.ScriptReadHalfword()); return false; }
function ScrCmd_clearflag(ctx: ScriptRunner): boolean { flagClear(ctx.ScriptReadHalfword()); return false; }
function ScrCmd_checkflag(ctx: ScriptRunner): boolean { ctx.comparisonResult = flagGet(ctx.ScriptReadHalfword()) ? 1 : 0; return false; }
function ScrCmd_initclock(ctx: ScriptRunner): boolean { ctx.ScriptReadHalfword(); ctx.ScriptReadHalfword(); return false; }
function ScrCmd_dotimebasedevents(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_gettime(ctx: ScriptRunner): boolean { varSet(SV.x8000, 0); varSet(SV.x8001, 0); varSet(SV.x8002, 0); return false; }
function ScrCmd_playse(ctx: ScriptRunner): boolean { sound.playSE(ctx.ScriptReadHalfword()); return false; }
function ScrCmd_waitse(ctx: ScriptRunner): boolean { ctx.SetupNativeScript(WaitForSoundEffectFinish); return true; }
function ScrCmd_playfanfare(ctx: ScriptRunner): boolean { sound.playFanfare(ctx.ScriptReadHalfword()); return false; }
function ScrCmd_waitfanfare(ctx: ScriptRunner): boolean { ctx.SetupNativeScript(WaitForFanfareFinish); return true; }
function ScrCmd_playbgm(ctx: ScriptRunner): boolean {
  const song = ctx.ScriptReadHalfword();
  const saveIt = ctx.readByte();
  if (saveIt) ctx.ow.savedMusic = song;
  sound.playNewMapMusic(song);
  return false;
}
function ScrCmd_savebgm(ctx: ScriptRunner): boolean { ctx.ow.savedMusic = ctx.ScriptReadHalfword(); return false; }
function ScrCmd_fadedefaultbgm(ctx: ScriptRunner): boolean { const music = ctx.ow.savedMusic || ctx.ow.header.music; if (music !== sound.currentBGM) sound.playNewMapMusic(music); return false; }
function ScrCmd_fadenewbgm(ctx: ScriptRunner): boolean { const music = ctx.ScriptReadHalfword(); if (music !== sound.currentBGM) sound.playNewMapMusic(music); return false; }
function ScrCmd_fadeoutbgm(ctx: ScriptRunner): boolean {
  const speed = ctx.readByte();
  if (gQuestLogState === C.QL_STATE_PLAYBACK) return false;
  sound.FadeOutBGMTemporarily(speed ? 4 * speed : 4);
  ctx.SetupNativeScript(() => sound.isBGMPausedOrStopped());
  return true;
}
function ScrCmd_fadeinbgm(ctx: ScriptRunner): boolean {
  const speed = ctx.readByte();
  if (gQuestLogState !== C.QL_STATE_PLAYBACK) sound.FadeInBGM(speed ? 4 * speed : 4);
  return false;
}
function ScrCmd_warp(ctx: ScriptRunner): boolean { readWarp(ctx); ctx.ow.DoWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; }
function ScrCmd_warpsilent(ctx: ScriptRunner): boolean { readWarp(ctx); ctx.ow.DoDiveWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; }
function ScrCmd_warpdoor(ctx: ScriptRunner): boolean { readWarp(ctx); ctx.ow.DoDoorWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; }
function ScrCmd_warphole(ctx: ScriptRunner): boolean {
  const group = ctx.readByte();
  const num = ctx.readByte();
  const p = ctx.ow.player.object;
  const x = p.currentCoords.x - MAP_OFFSET, y = p.currentCoords.y - MAP_OFFSET;
  if (group === 0x7f && num === 0x7f) ctx.ow.SetWarpDestinationToFixedHoleWarp(x, y);
  else ctx.ow.SetWarpDestination(group, num, -1, x, y);
  ctx.ow.DoFallWarp();
  ctx.ow.resetInitialPlayerAvatarState();
  return true;
}
function ScrCmd_warpteleport(ctx: ScriptRunner): boolean { readWarp(ctx); ctx.ow.DoTeleportWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; }
function ScrCmd_warpspinenter(ctx: ScriptRunner): boolean { readWarp(ctx); ctx.ow.setInitialPlayerAvatarStateWithDirection(ctx.ow.player.object.facingDirection); ctx.ow.DoTeleport2Warp(); ctx.ow.resetInitialPlayerAvatarState(); return true; }
function ScrCmd_setwarp(ctx: ScriptRunner): boolean { readWarp(ctx); return false; }
function ScrCmd_setdynamicwarp(ctx: ScriptRunner): boolean { const w = readWarpData(ctx); ctx.ow.SetDynamicWarpWithCoords(0, w.mapGroup, w.mapNum, w.warpId, w.x, w.y); return false; }
function ScrCmd_setdivewarp(ctx: ScriptRunner): boolean { const w = readWarpData(ctx); ctx.ow.SetFixedDiveWarp(w.mapGroup, w.mapNum, w.warpId, w.x, w.y); return false; }
function ScrCmd_setholewarp(ctx: ScriptRunner): boolean { const w = readWarpData(ctx); ctx.ow.SetFixedHoleWarp(w.mapGroup, w.mapNum, w.warpId, w.x, w.y); return false; }
function ScrCmd_setescapewarp(ctx: ScriptRunner): boolean { const w = readWarpData(ctx); ctx.ow.SetEscapeWarp(w.mapGroup, w.mapNum, w.warpId, w.x, w.y); return false; }
function ScrCmd_getplayerxy(ctx: ScriptRunner): boolean {
  const vx = ctx.ScriptReadHalfword();
  const vy = ctx.ScriptReadHalfword();
  varSet(vx, save.pos.x);
  varSet(vy, save.pos.y);
  return false;
}
function ScrCmd_getpartysize(ctx: ScriptRunner): boolean { varSet(SV.RESULT, save.party.length); return false; }
function ScrCmd_additem(ctx: ScriptRunner): boolean {
  const i = varGet(ctx.ScriptReadHalfword());
  const q = varGet(ctx.ScriptReadHalfword());
  varSet(SV.RESULT, items.addBagItem(i, q & 0xff) ? 1 : 0);
  items.TrySetObtainedItemQuestLogEvent(i, ctx.ow.header.regionMapSection);
  return false;
}
function ScrCmd_removeitem(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.removeBagItem(i, q & 0xff) ? 1 : 0); return false; }
function ScrCmd_checkitemspace(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.checkBagHasSpace(i, q & 0xff) ? 1 : 0); return false; }
function ScrCmd_checkitem(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.checkBagHasItem(i, q & 0xff) ? 1 : 0); return false; }
function ScrCmd_checkitemtype(ctx: ScriptRunner): boolean { varSet(SV.RESULT, items.itemPocket(varGet(ctx.ScriptReadHalfword()))); return false; }
function ScrCmd_addpcitem(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.addPCItem(i, q) ? 1 : 0); return false; }
function ScrCmd_checkpcitem(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.checkPCHasItem(i, q) ? 1 : 0); return false; }
function ScrCmd_adddecoration(ctx: ScriptRunner): boolean { ctx.ScriptReadHalfword(); return false; }
function ScrCmd_removedecoration(ctx: ScriptRunner): boolean { ctx.ScriptReadHalfword(); return false; }
function ScrCmd_checkdecor(ctx: ScriptRunner): boolean { ctx.ScriptReadHalfword(); return false; }
function ScrCmd_checkdecorspace(ctx: ScriptRunner): boolean { ctx.ScriptReadHalfword(); return false; }
function ScrCmd_applymovement(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  const ptr = ctx.ScriptReadWord();
  ctx.ow.game.scriptMovement.start(ctx.ow.objects.byLocalIdAndMap(localId, save.location.mapNum, save.location.mapGroup), ptr);
  movingNpcId = localId;
  return false;
}
function ScrCmd_applymovementat(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  const ptr = ctx.ScriptReadWord();
  const mapGroup = ctx.readByte();
  const mapNum = ctx.readByte();
  ctx.ow.game.scriptMovement.start(ctx.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup), ptr);
  movingNpcId = localId;
  return false;
}
function ScrCmd_waitmovement(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  if (localId !== 0) movingNpcId = localId;
  const id = movingNpcId;
  const { mapNum, mapGroup } = save.location;
  ctx.SetupNativeScript(() => WaitForMovementFinish(ctx, id, mapNum, mapGroup));
  return true;
}
function ScrCmd_waitmovementat(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  if (localId !== 0) movingNpcId = localId;
  const mapGroup = ctx.readByte();
  const mapNum = ctx.readByte();
  const id = movingNpcId;
  ctx.SetupNativeScript(() => WaitForMovementFinish(ctx, id, mapNum, mapGroup));
  return true;
}
function ScrCmd_removeobject(ctx: ScriptRunner): boolean { removeObject(ctx, varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_removeobjectat(ctx: ScriptRunner): boolean { removeResolvedObject(ctx, readObjectAt(ctx)); return false; }
function ScrCmd_addobject(ctx: ScriptRunner): boolean { addObject(ctx, varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_addobjectat(ctx: ScriptRunner): boolean {
  const id = varGet(ctx.ScriptReadHalfword()) & 0xff;
  const mapGroup = ctx.readByte();
  const mapNum = ctx.readByte();
  if (mapGroup === save.location.mapGroup && mapNum === save.location.mapNum) {
    addObject(ctx, id);
    return false;
  }
  const mapId = rom.mapIdByNum((mapGroup << 8) | mapNum);
  if (!mapId) throw new Error(`Unknown object map ${mapGroup}.${mapNum}`);
  const spawn = (header: MapHeader): void => {
    const template = header.objects.find(t => !t.clone && t.localId === id);
    if (!template || template.clone) return;
    if (ctx.ow.objects.spawnFromTemplate({ ...template }, mapNum, mapGroup)) ctx.ow.syncObjectSprites();
  };
  const cached = rom.cachedMap(mapId);
  if (cached) { spawn(cached); return false; }
  // Browser adaptation: wait for the source map data before resuming bytecode.
  let loaded: MapHeader | undefined;
  let failed = false;
  let failure: unknown;
  void rom.loadMap(mapId).then(header => { loaded = header; }, error => { failed = true; failure = error; });
  ctx.SetupNativeScript(() => {
    if (failed) throw failure;
    if (!loaded) return false;
    spawn(loaded);
    return true;
  });
  return true;
}
function ScrCmd_setobjectxy(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  const x = varGet(ctx.ScriptReadHalfword());
  const y = varGet(ctx.ScriptReadHalfword());
  ctx.ow.objects.TryMoveObjectEventToMapCoords(localId, ctx.ow.objects.mapNum, ctx.ow.objects.mapGroup, x, y);
  return false;
}
function ScrCmd_setobjectxyperm(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  const x = varGet(ctx.ScriptReadHalfword());
  const y = varGet(ctx.ScriptReadHalfword());
  ctx.ow.SetObjEventTemplateCoords(localId, x, y);
  return false;
}
function ScrCmd_copyobjectxytoperm(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  ctx.ow.objects.TryOverrideObjectEventTemplateCoords(localId, ctx.ow.objects.mapNum, ctx.ow.objects.mapGroup);
  return false;
}
function ScrCmd_showobjectat(ctx: ScriptRunner): boolean { const o = readObjectAt(ctx); if (o) ctx.ow.objects.SetObjectInvisibility(o.localId, o.mapNum, o.mapGroup, 0); return false; }
function ScrCmd_hideobjectat(ctx: ScriptRunner): boolean { const o = readObjectAt(ctx); if (o) ctx.ow.objects.SetObjectInvisibility(o.localId, o.mapNum, o.mapGroup, 1); return false; }
function ScrCmd_setobjectsubpriority(ctx: ScriptRunner): boolean {
  const o = readObjectAt(ctx);
  const p = ctx.readByte();
  if (o) ctx.ow.objects.SetObjectSubpriority(o.localId, o.mapNum, o.mapGroup, (p + 83) & 0xff);
  return false;
}
function ScrCmd_resetobjectsubpriority(ctx: ScriptRunner): boolean {
  const o = readObjectAt(ctx);
  if (o) ctx.ow.objects.ResetObjectSubpriority(o.localId, o.mapNum, o.mapGroup);
  return false;
}
function ScrCmd_faceplayer(ctx: ScriptRunner): boolean {
  const o = selected(ctx);
  if (o && o.active) ctx.ow.objects.turn(o, OPPOSITE[ctx.ow.player.object.facingDirection]);
  return false;
}
function ScrCmd_turnobject(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  const direction = ctx.readByte();
  const o = localIdObject(ctx, localId);
  if (o) ctx.ow.objects.turn(o, direction);
  return false;
}
function ScrCmd_setobjectmovementtype(ctx: ScriptRunner): boolean {
  const localId = varGet(ctx.ScriptReadHalfword());
  const type = ctx.readByte();
  ctx.ow.SetObjEventTemplateMovementType(localId, type);
  return false;
}
function ScrCmd_createvobject(ctx: ScriptRunner): boolean {
  const gfx = ctx.readByte(); const id = ctx.readByte(); const x = varGet(ctx.ScriptReadHalfword()); const y = varGet(ctx.ScriptReadHalfword()); const elevation = ctx.readByte(); const dir = ctx.readByte();
  ctx.ow.game.createVirtualObject(gfx, id, x, y, elevation, dir);
  return false;
}
function ScrCmd_turnvobject(ctx: ScriptRunner): boolean { const id = ctx.readByte(); const dir = ctx.readByte(); ctx.ow.game.turnVirtualObject(id, dir); return false; }
function ScrCmd_lockall(ctx: ScriptRunner): boolean {
  FreezeObjects_WaitForPlayer(ctx);
  return true;
}
function ScrCmd_lock(ctx: ScriptRunner): boolean {
  const o = selected(ctx);
  if (o && o.active && !o.isPlayer) {
    FreezeObjects_WaitForPlayerAndSelected(ctx);
  } else {
    FreezeObjects_WaitForPlayer(ctx);
  }
  return true;
}
function ScrCmd_releaseall(ctx: ScriptRunner): boolean {
  ctx.ow.messageBox.hide();
  ClearPlayerHeldMovementAndUnfreezeObjectEvents(ctx);
  return false;
}
function ScrCmd_release(ctx: ScriptRunner): boolean {
  ctx.ow.messageBox.hide();
  const o = selected(ctx);
  if (o && o.active) ctx.ow.objects.ObjectEventClearHeldMovementIfFinished(o);
  ClearPlayerHeldMovementAndUnfreezeObjectEvents(ctx);
  return false;
}
function ScrCmd_textcolor(ctx: ScriptRunner): boolean { varSet(SV.PREV_TEXT_COLOR, varGet(SV.TEXT_COLOR)); varSet(SV.TEXT_COLOR, ctx.readByte()); return false; }
function ScrCmd_message(ctx: ScriptRunner): boolean { ctx.ow.messageBox.show(rom.stringAt(textPtr(ctx))); return false; }
function ScrCmd_messageautoscroll(ctx: ScriptRunner): boolean { ctx.ow.messageBox.show(rom.stringAt(textPtr(ctx)), true); return false; }
function ScrCmd_vmessage(ctx: ScriptRunner): boolean { ctx.ow.messageBox.show(rom.stringAt(ctx.ScriptReadWord() - addressOffset)); return false; }
function ScrCmd_loadhelp(ctx: ScriptRunner): boolean { DrawHelpMessageWindowWithText(ctx.ow.windows, rom.stringAt(textPtr(ctx))); return false; }
function ScrCmd_unloadhelp(ctx: ScriptRunner): boolean { DestroyHelpMessageWindow(ctx.ow.windows, 0); return false; }
function ScrCmd_waitmessage(ctx: ScriptRunner): boolean { ctx.SetupNativeScript(() => ctx.ow.messageBox.isHidden()); return true; }
function ScrCmd_closemessage(ctx: ScriptRunner): boolean { ctx.ow.messageBox.hide(); return false; }
/** ScrCmd_waitbuttonpress (scrcmd.c): also drives ScriptContext_GetQuestLogInput
 * so the Quest Log can record/replay the input that ended a message wait. */
function ScrCmd_waitbuttonpress(ctx: ScriptRunner): boolean {
  if (QL_GetPlaybackState() === C.QL_PLAYBACK_STATE_RUNNING || gQuestLogState === C.QL_STATE_PLAYBACK) {
    questLogWaitButtonPressTimer = 0;
  }
  ctx.SetupNativeScript(WaitForAorBPress.bind(null, ctx));
  return true;
}
function ScrCmd_yesnobox(ctx: ScriptRunner): boolean {
  const left = ctx.readByte();
  const top = ctx.readByte();
  if (ctx.ow.game.scriptMenu.ScriptMenu_YesNo(left, top)) { ctx.ow.script.ScriptContext_Stop(); return true; }
  return false;
}
function ScrCmd_multichoice(ctx: ScriptRunner): boolean {
  const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const ignoreB = ctx.readByte();
  if (ctx.ow.game.scriptMenu.ScriptMenu_Multichoice(left, top, id, ignoreB !== 0)) { ctx.ow.script.ScriptContext_Stop(); return true; }
  return false;
}
function ScrCmd_multichoicedefault(ctx: ScriptRunner): boolean {
  const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const def = ctx.readByte(); const ignoreB = ctx.readByte();
  if (ctx.ow.game.scriptMenu.ScriptMenu_MultichoiceWithDefault(left, top, id, ignoreB !== 0, def)) { ctx.ow.script.ScriptContext_Stop(); return true; }
  return false;
}
function ScrCmd_multichoicegrid(ctx: ScriptRunner): boolean {
  const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const cols = ctx.readByte(); const ignoreB = ctx.readByte();
  if (ctx.ow.game.scriptMenu.ScriptMenu_MultichoiceGrid(left, top, id, ignoreB !== 0, cols)) { ctx.ow.script.ScriptContext_Stop(); return true; }
  return false;
}
function ScrCmd_drawbox(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_erasebox(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.readByte(); ctx.readByte(); ctx.readByte(); return false; }
function ScrCmd_drawboxtext(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_showmonpic(ctx: ScriptRunner): boolean {
  const species = varGet(ctx.ScriptReadHalfword());
  const x = ctx.readByte(); const y = ctx.readByte();
  ctx.ow.game.scriptMenu.ScriptMenu_ShowPokemonPic(species, x, y);
  sound.PlayCry_Script(species, C.CRY_MODE_NORMAL);
  return false;
}
function ScrCmd_hidemonpic(ctx: ScriptRunner): boolean {
  const wait = ctx.ow.game.scriptMenu.ScriptMenu_HidePokemonPic();
  if (!wait) return false;
  ctx.SetupNativeScript(wait);
  return true;
}
function ScrCmd_showcontestpainting(ctx: ScriptRunner): boolean { ctx.readByte(); return false; }
function ScrCmd_braillemessage(ctx: ScriptRunner): boolean { ctx.ow.messageBox.showBraille(rom.stringAt(textPtr(ctx))); return false; }
function ScrCmd_getbraillestringwidth(ctx: ScriptRunner): boolean { varSet(SV.x8004, GetStringWidth(FONT_BRAILLE, rom.stringAt(textPtr(ctx)), -1)); return false; }
function ScrCmd_bufferspeciesname(ctx: ScriptRunner): boolean { const i = ctx.readByte(); stringVarSet(i, speciesName(varGet(ctx.ScriptReadHalfword()))); return false; }
function ScrCmd_bufferleadmonspeciesname(ctx: ScriptRunner): boolean { const i = ctx.readByte(); const mon = save.party[leadMonIndex()]; stringVarSet(i, speciesName(mon?.species ?? 0)); return false; }
function ScrCmd_bufferpartymonnick(ctx: ScriptRunner): boolean { const i = ctx.readByte(); const idx = varGet(ctx.ScriptReadHalfword()); const mon = save.party[idx]; stringVarSet(i, mon ? nickname(mon) : encode("")); return false; }
function ScrCmd_bufferitemname(ctx: ScriptRunner): boolean { const i = ctx.readByte(); stringVarSet(i, items.itemName(varGet(ctx.ScriptReadHalfword()))); return false; }
function ScrCmd_bufferitemnameplural(ctx: ScriptRunner): boolean {
  const i = ctx.readByte();
  const item = varGet(ctx.ScriptReadHalfword());
  const quantity = varGet(ctx.ScriptReadHalfword());
  let name = items.itemName(item);
  const c = rom.constants;
  if (item === c.ITEM_POKE_BALL && quantity >= 2) name = concat(name, encode("S"));
  else if (item >= c.FIRST_BERRY_INDEX && item < c.LAST_BERRY_INDEX && quantity >= 2) {
    const len = length(name);
    name = concat(name.slice(0, Math.max(0, len - 1)), encode("IES"));
  }
  stringVarSet(i, name);
  return false;
}
function ScrCmd_bufferdecorationname(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.ScriptReadHalfword(); return false; }
function ScrCmd_buffermovename(ctx: ScriptRunner): boolean { const i = ctx.readByte(); stringVarSet(i, b64(rom.moves[varGet(ctx.ScriptReadHalfword())]?.name ?? rom.moves[0].name)); return false; }
function ScrCmd_buffernumberstring(ctx: ScriptRunner): boolean { const i = ctx.readByte(); const n = varGet(ctx.ScriptReadHalfword()); stringVarSet(i, intToDecimal(n, STR_CONV_MODE_LEFT_ALIGN, countDigits(n))); return false; }
function ScrCmd_bufferstdstring(ctx: ScriptRunner): boolean {
  const i = ctx.readByte();
  const index = varGet(ctx.ScriptReadHalfword());
  const sym = rom.scriptMenu.stdStrings[index];
  stringVarSet(i, sym ? rom.text(sym) : encode(""));
  return false;
}
function ScrCmd_bufferstring(ctx: ScriptRunner): boolean { const i = ctx.readByte(); stringVarSet(i, rom.stringAt(ctx.ScriptReadWord())); return false; }
function ScrCmd_vbuffermessage(ctx: ScriptRunner): boolean { stringVars.var4 = rom.stringAt(ctx.ScriptReadWord() - addressOffset); return false; }
function ScrCmd_vbufferstring(ctx: ScriptRunner): boolean { const i = ctx.readByte(); stringVarSet(i, rom.stringAt(ctx.ScriptReadWord() - addressOffset)); return false; }
// scrcmd.c ScrCmd_bufferboxname copies GetBoxNamePtr, including custom names.
function ScrCmd_bufferboxname(ctx: ScriptRunner): boolean {
  const i = ctx.readByte();
  const box = varGet(ctx.ScriptReadHalfword());
  stringVarSet(i, getBoxName(box));
  return false;
}
function ScrCmd_givemon(ctx: ScriptRunner): boolean {
  const species = varGet(ctx.ScriptReadHalfword());
  const level = ctx.readByte();
  const item = varGet(ctx.ScriptReadHalfword());
  ctx.ScriptReadWord(); ctx.ScriptReadWord(); ctx.readByte();
  varSet(SV.RESULT, ctx.ow.game.scriptGiveMon(species, level, item));
  return false;
}
function ScrCmd_giveegg(ctx: ScriptRunner): boolean { const species = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, ctx.ow.game.scriptGiveEgg(species)); return false; }
function ScrCmd_setmonmove(ctx: ScriptRunner): boolean {
  const partyIndex = ctx.readByte(); const slot = ctx.readByte(); const move = ctx.ScriptReadHalfword();
  ScriptSetMonMoveSlot(partyIndex, move, slot);
  return false;
}
function ScrCmd_checkpartymove(ctx: ScriptRunner): boolean {
  const move = ctx.ScriptReadHalfword();
  varSet(SV.RESULT, 6);
  for (let i = 0; i < save.party.length; i++) {
    const mon = save.party[i];
    if (!mon.species) break;
    if (!mon.isEgg && knowsMove(mon, move)) {
      varSet(SV.RESULT, i);
      varSet(SV.x8004, mon.species);
      break;
    }
  }
  return false;
}
function ScrCmd_addmoney(ctx: ScriptRunner): boolean { const amount = ctx.ScriptReadWord(); const ignore = ctx.readByte(); if (!ignore) items.addMoney(amount); return false; }
function ScrCmd_removemoney(ctx: ScriptRunner): boolean { const amount = ctx.ScriptReadWord(); const ignore = ctx.readByte(); if (!ignore) items.removeMoney(amount); return false; }
function ScrCmd_checkmoney(ctx: ScriptRunner): boolean { const amount = ctx.ScriptReadWord(); const ignore = ctx.readByte(); if (!ignore) varSet(SV.RESULT, items.isEnoughMoney(amount) ? 1 : 0); return false; }
function ScrCmd_showmoneybox(ctx: ScriptRunner): boolean { const x = ctx.readByte(); const y = ctx.readByte(); const ignore = ctx.readByte(); if (!ignore) ctx.ow.game.scriptMenu.showMoneyBox(x, y); return false; }
function ScrCmd_hidemoneybox(ctx: ScriptRunner): boolean { ctx.ow.game.scriptMenu.hideMoneyBox(); return false; }
function ScrCmd_updatemoneybox(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.readByte(); const ignore = ctx.readByte(); if (!ignore) ctx.ow.game.scriptMenu.updateMoneyBox(); return false; }
function ScrCmd_showcoinsbox(ctx: ScriptRunner): boolean { const x = ctx.readByte(); const y = ctx.readByte(); ctx.ow.game.scriptMenu.showCoinsBox(x, y); return false; }
function ScrCmd_hidecoinsbox(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.readByte(); ctx.ow.game.scriptMenu.hideCoinsBox(); return false; }
function ScrCmd_updatecoinsbox(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.readByte(); ctx.ow.game.scriptMenu.updateCoinsBox(); return false; }
function ScrCmd_checkcoins(ctx: ScriptRunner): boolean { varSet(ctx.ScriptReadHalfword(), items.GetCoins()); return false; }
function ScrCmd_addcoins(ctx: ScriptRunner): boolean { varSet(SV.RESULT, items.addCoins(varGet(ctx.ScriptReadHalfword())) ? 0 : 1); return false; }
function ScrCmd_removecoins(ctx: ScriptRunner): boolean { varSet(SV.RESULT, items.removeCoins(varGet(ctx.ScriptReadHalfword())) ? 0 : 1); return false; }
function ScrCmd_trainerbattle(ctx: ScriptRunner): boolean { ctx.scriptPtr = ctx.ow.game.battleSetup.BattleSetup_ConfigureTrainerBattle(ctx.scriptPtr); return false; }
function ScrCmd_dotrainerbattle(ctx: ScriptRunner): boolean { ctx.ow.game.battleSetup.startTrainerBattle(); return true; }
function ScrCmd_gotopostbattlescript(ctx: ScriptRunner): boolean { ctx.scriptPtr = ctx.ow.game.battleSetup.BattleSetup_GetScriptAddrAfterBattle(); return false; }
function ScrCmd_gotobeatenscript(ctx: ScriptRunner): boolean { ctx.scriptPtr = ctx.ow.game.battleSetup.BattleSetup_GetTrainerPostBattleScript(); return false; }
function ScrCmd_checktrainerflag(ctx: ScriptRunner): boolean { ctx.comparisonResult = ctx.ow.game.battleSetup.HasTrainerBeenFought(varGet(ctx.ScriptReadHalfword())) ? 1 : 0; return false; }
function ScrCmd_settrainerflag(ctx: ScriptRunner): boolean { ctx.ow.game.battleSetup.SetTrainerFlag(varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_cleartrainerflag(ctx: ScriptRunner): boolean { ctx.ow.game.battleSetup.ClearTrainerFlag(varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_setwildbattle(ctx: ScriptRunner): boolean {
  const species = ctx.ScriptReadHalfword(); const level = ctx.readByte(); const item = ctx.ScriptReadHalfword();
  ctx.ow.game.battleSetup.createScriptedWildMon(species, level, item);
  return false;
}
function ScrCmd_dowildbattle(ctx: ScriptRunner): boolean { ctx.ow.game.battleSetup.startScriptedWildBattle(); ctx.ow.script.ScriptContext_Stop(); return true; }
function ScrCmd_pokemart(ctx: ScriptRunner): boolean { const ptr = ctx.ScriptReadWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.ScriptContext_Stop(); return true; }
function ScrCmd_pokemartdecoration(ctx: ScriptRunner): boolean { const ptr = ctx.ScriptReadWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.ScriptContext_Stop(); return true; }
function ScrCmd_pokemartdecoration2(ctx: ScriptRunner): boolean { const ptr = ctx.ScriptReadWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.ScriptContext_Stop(); return true; }
function ScrCmd_playslotmachine(ctx: ScriptRunner): boolean { const id = varGet(ctx.ScriptReadHalfword()); ctx.ow.game.playSlotMachine(id); ctx.ow.script.ScriptContext_Stop(); return true; }
function ScrCmd_setberrytree(ctx: ScriptRunner): boolean { ctx.readByte(); ctx.readByte(); ctx.readByte(); return false; }
function ScrCmd_choosecontestmon(ctx: ScriptRunner): boolean { ctx.ow.script.ScriptContext_Stop(); return true; }
function ScrCmd_startcontest(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_showcontestresults(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_contestlinktransfer(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_getpokenewsactive(ctx: ScriptRunner): boolean { ctx.ScriptReadHalfword(); return false; }
function ScrCmd_fadescreen(ctx: ScriptRunner): boolean {
  paletteFade.fadeScreen(ctx.readByte(), 0);
  ctx.SetupNativeScript(IsPaletteNotActive);
  return true;
}
function ScrCmd_fadescreenspeed(ctx: ScriptRunner): boolean {
  const mode = ctx.readByte();
  const speed = ctx.readByte();
  paletteFade.fadeScreen(mode, speed);
  ctx.SetupNativeScript(IsPaletteNotActive);
  return true;
}
function ScrCmd_setflashlevel(ctx: ScriptRunner): boolean { ctx.ow.SetFlashLevel(varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_animateflash(ctx: ScriptRunner): boolean {
  const target = ctx.readByte();
  ctx.ow.game.animateFlash(target);
  ctx.ow.script.ScriptContext_Stop();
  return true;
}
function ScrCmd_dofieldeffect(ctx: ScriptRunner): boolean { fieldEffectScriptId = varGet(ctx.ScriptReadHalfword()); ctx.ow.game.fieldEffectStart(fieldEffectScriptId); return false; }
function ScrCmd_setfieldeffectargument(ctx: ScriptRunner): boolean { const n = ctx.readByte(); ctx.ow.game.fieldEffectArguments[n] = (varGet(ctx.ScriptReadHalfword()) << 16) >> 16; return false; }
function ScrCmd_waitfieldeffect(ctx: ScriptRunner): boolean {
  fieldEffectScriptId = varGet(ctx.ScriptReadHalfword());
  const id = fieldEffectScriptId;
  ctx.SetupNativeScript(() => WaitForFieldEffectFinish(ctx, id));
  return true;
}
function ScrCmd_setrespawn(ctx: ScriptRunner): boolean { ctx.ow.setLastHealLocationWarp(varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_checkplayergender(ctx: ScriptRunner): boolean { varSet(SV.RESULT, save.playerGender); return false; }
function ScrCmd_playmoncry(ctx: ScriptRunner): boolean { const species = varGet(ctx.ScriptReadHalfword()); const mode = varGet(ctx.ScriptReadHalfword()); sound.PlayCry_Script(species, mode); return false; }
function ScrCmd_waitmoncry(ctx: ScriptRunner): boolean { ctx.SetupNativeScript(() => sound.isCryFinished()); return true; }
function ScrCmd_setmetatile(ctx: ScriptRunner): boolean {
  const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
  const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
  const metatile = varGet(ctx.ScriptReadHalfword());
  const impassable = varGet(ctx.ScriptReadHalfword());
  MapGridSetMetatileIdAt(x, y, impassable ? metatile | MAPGRID_COLLISION_MASK : metatile, ctx.ow.map);
  return false;
}
function ScrCmd_resetweather(ctx: ScriptRunner): boolean { ctx.ow.game.weather.SetSavedWeatherFromCurrMapHeader(ctx.ow.header.weather); return false; }
function ScrCmd_setweather(ctx: ScriptRunner): boolean { ctx.ow.game.weather.setWeather(varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_doweather(ctx: ScriptRunner): boolean { ctx.ow.game.weather.DoCurrentWeather(); return false; }
function ScrCmd_setstepcallback(ctx: ScriptRunner): boolean { ctx.ow.game.setStepCallback(ctx.readByte()); return false; }
function ScrCmd_setmaplayoutindex(ctx: ScriptRunner): boolean { ctx.ow.game.setMapLayoutIndex(varGet(ctx.ScriptReadHalfword())); return false; }
function ScrCmd_opendoor(ctx: ScriptRunner): boolean {
  const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
  const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
  sound.playSE(ctx.ow.doors.GetDoorSoundEffect(x, y));
  ctx.ow.doors.FieldAnimateDoorOpen(x, y);
  return false;
}
function ScrCmd_closedoor(ctx: ScriptRunner): boolean { const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; ctx.ow.doors.FieldAnimateDoorClose(x, y); return false; }
function ScrCmd_waitdooranim(ctx: ScriptRunner): boolean { ctx.SetupNativeScript(() => IsDoorAnimationStopped(ctx)); return true; }
function ScrCmd_setdooropen(ctx: ScriptRunner): boolean { const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; ctx.ow.doors.FieldSetDoorOpened(x, y); return false; }
function ScrCmd_setdoorclosed(ctx: ScriptRunner): boolean { const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; ctx.ow.doors.FieldSetDoorClosed(x, y); return false; }
function ScrCmd_addelevmenuitem(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_showelevmenu(ctx: ScriptRunner): boolean { return false; }
function ScrCmd_setvaddress(ctx: ScriptRunner): boolean { const addr1 = ctx.scriptPtr - 1; const addr2 = ctx.ScriptReadWord(); addressOffset = addr2 - addr1; return false; }
function ScrCmd_vgoto(ctx: ScriptRunner): boolean { ctx.ScriptJump(ctx.ScriptReadWord() - addressOffset); return false; }
function ScrCmd_vcall(ctx: ScriptRunner): boolean { ctx.ScriptCall(ctx.ScriptReadWord() - addressOffset); return false; }
function ScrCmd_vgoto_if(ctx: ScriptRunner): boolean { const c = ctx.readByte(); const p = ctx.ScriptReadWord() - addressOffset; if (cond(ctx, c)) ctx.ScriptJump(p); return false; }
function ScrCmd_vcall_if(ctx: ScriptRunner): boolean { const c = ctx.readByte(); const p = ctx.ScriptReadWord() - addressOffset; if (cond(ctx, c)) ctx.ScriptCall(p); return false; }
function ScrCmd_incrementgamestat(ctx: ScriptRunner): boolean { incrementGameStat(ctx.readByte()); return false; }
function ScrCmd_comparestat(ctx: ScriptRunner): boolean {
  const stat = ctx.readByte();
  const value = ctx.ScriptReadWord();
  ctx.comparisonResult = compare(GetGameStat(stat), value);
  return false;
}
function ScrCmd_signmsg(ctx: ScriptRunner): boolean { ctx.ow.control.MsgSetSignpost(); return false; }
function ScrCmd_normalmsg(ctx: ScriptRunner): boolean { ctx.ow.control.MsgSetNotSignpost(); return false; }
function ScrCmd_setmonmodernfatefulencounter(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); if (save.party[i]) save.party[i].modernFatefulEncounter = true; return false; }
function ScrCmd_checkmonmodernfatefulencounter(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, save.party[i]?.modernFatefulEncounter ? 1 : 0); return false; }
function ScrCmd_setworldmapflag(ctx: ScriptRunner): boolean { const flag = ctx.ScriptReadHalfword(); QuestLog_RecordEnteredMap(flag); MapPreview_SetFlag(flag); return false; }
function ScrCmd_setmonmetlocation(ctx: ScriptRunner): boolean { const i = varGet(ctx.ScriptReadHalfword()); const loc = ctx.readByte(); if (save.party[i]) save.party[i].metLocation = loc; return false; }

export const COMMANDS: Record<string, ScriptCommand> = {
  ScrCmd_nop, ScrCmd_nop1, ScrCmd_end, ScrCmd_return, ScrCmd_call, ScrCmd_goto, ScrCmd_goto_if, ScrCmd_call_if,
  ScrCmd_gotostd, ScrCmd_callstd, ScrCmd_gotostd_if, ScrCmd_callstd_if, ScrCmd_returnram, ScrCmd_endram,
  ScrCmd_setmysteryeventstatus, ScrCmd_trywondercardscript, ScrCmd_loadword, ScrCmd_loadbyte, ScrCmd_loadbytefromptr,
  ScrCmd_setptr, ScrCmd_setptrbyte, ScrCmd_copylocal, ScrCmd_copybyte, ScrCmd_setvar, ScrCmd_copyvar, ScrCmd_setorcopyvar,
  ScrCmd_compare_local_to_local, ScrCmd_compare_local_to_value, ScrCmd_compare_local_to_ptr, ScrCmd_compare_ptr_to_local,
  ScrCmd_compare_ptr_to_value, ScrCmd_compare_ptr_to_ptr, ScrCmd_compare_var_to_value, ScrCmd_compare_var_to_var,
  ScrCmd_addvar, ScrCmd_subvar, ScrCmd_random, ScrCmd_callnative, ScrCmd_gotonative, ScrCmd_special, ScrCmd_specialvar,
  ScrCmd_waitstate, ScrCmd_delay, ScrCmd_setflag, ScrCmd_clearflag, ScrCmd_checkflag, ScrCmd_initclock,
  ScrCmd_dotimebasedevents, ScrCmd_gettime, ScrCmd_playse, ScrCmd_waitse, ScrCmd_playfanfare, ScrCmd_waitfanfare,
  ScrCmd_playbgm, ScrCmd_savebgm, ScrCmd_fadedefaultbgm, ScrCmd_fadenewbgm, ScrCmd_fadeoutbgm, ScrCmd_fadeinbgm,
  ScrCmd_warp, ScrCmd_warpsilent, ScrCmd_warpdoor, ScrCmd_warphole, ScrCmd_warpteleport, ScrCmd_warpspinenter,
  ScrCmd_setwarp, ScrCmd_setdynamicwarp, ScrCmd_setdivewarp, ScrCmd_setholewarp, ScrCmd_setescapewarp,
  ScrCmd_getplayerxy, ScrCmd_getpartysize, ScrCmd_additem, ScrCmd_removeitem, ScrCmd_checkitemspace, ScrCmd_checkitem,
  ScrCmd_checkitemtype, ScrCmd_addpcitem, ScrCmd_checkpcitem, ScrCmd_adddecoration, ScrCmd_removedecoration,
  ScrCmd_checkdecor, ScrCmd_checkdecorspace, ScrCmd_applymovement, ScrCmd_applymovementat, ScrCmd_waitmovement,
  ScrCmd_waitmovementat, ScrCmd_removeobject, ScrCmd_removeobjectat, ScrCmd_addobject, ScrCmd_addobjectat,
  ScrCmd_setobjectxy, ScrCmd_setobjectxyperm, ScrCmd_copyobjectxytoperm, ScrCmd_showobjectat, ScrCmd_hideobjectat,
  ScrCmd_setobjectsubpriority, ScrCmd_resetobjectsubpriority, ScrCmd_faceplayer, ScrCmd_turnobject,
  ScrCmd_setobjectmovementtype, ScrCmd_createvobject, ScrCmd_turnvobject, ScrCmd_lockall, ScrCmd_lock,
  ScrCmd_releaseall, ScrCmd_release, ScrCmd_textcolor, ScrCmd_message, ScrCmd_loadhelp, ScrCmd_unloadhelp,
  ScrCmd_messageautoscroll, ScrCmd_waitmessage, ScrCmd_closemessage, ScrCmd_waitbuttonpress, ScrCmd_yesnobox,
  ScrCmd_multichoice, ScrCmd_multichoicedefault, ScrCmd_drawbox, ScrCmd_multichoicegrid, ScrCmd_erasebox,
  ScrCmd_drawboxtext, ScrCmd_showmonpic, ScrCmd_hidemonpic, ScrCmd_showcontestpainting, ScrCmd_braillemessage,
  ScrCmd_getbraillestringwidth, ScrCmd_vmessage, ScrCmd_bufferspeciesname, ScrCmd_bufferleadmonspeciesname,
  ScrCmd_bufferpartymonnick, ScrCmd_bufferitemname, ScrCmd_bufferitemnameplural, ScrCmd_bufferdecorationname,
  ScrCmd_buffermovename, ScrCmd_buffernumberstring, ScrCmd_bufferstdstring, ScrCmd_bufferstring,
  ScrCmd_vbuffermessage, ScrCmd_vbufferstring, ScrCmd_bufferboxname, ScrCmd_givemon, ScrCmd_giveegg,
  ScrCmd_setmonmove, ScrCmd_checkpartymove, ScrCmd_addmoney, ScrCmd_removemoney, ScrCmd_checkmoney,
  ScrCmd_showmoneybox, ScrCmd_hidemoneybox, ScrCmd_updatemoneybox, ScrCmd_showcoinsbox, ScrCmd_hidecoinsbox,
  ScrCmd_updatecoinsbox, ScrCmd_checkcoins, ScrCmd_addcoins, ScrCmd_removecoins,
  ScrCmd_trainerbattle, ScrCmd_dotrainerbattle, ScrCmd_gotopostbattlescript,
  ScrCmd_gotobeatenscript, ScrCmd_checktrainerflag, ScrCmd_settrainerflag, ScrCmd_cleartrainerflag,
  ScrCmd_setwildbattle, ScrCmd_dowildbattle, ScrCmd_pokemart, ScrCmd_pokemartdecoration, ScrCmd_pokemartdecoration2,
  ScrCmd_playslotmachine, ScrCmd_setberrytree, ScrCmd_choosecontestmon, ScrCmd_startcontest, ScrCmd_showcontestresults,
  ScrCmd_contestlinktransfer, ScrCmd_getpokenewsactive, ScrCmd_fadescreen, ScrCmd_fadescreenspeed,
  ScrCmd_setflashlevel, ScrCmd_animateflash, ScrCmd_dofieldeffect, ScrCmd_setfieldeffectargument,
  ScrCmd_waitfieldeffect, ScrCmd_setrespawn, ScrCmd_checkplayergender, ScrCmd_playmoncry, ScrCmd_waitmoncry,
  ScrCmd_setmetatile, ScrCmd_resetweather, ScrCmd_setweather, ScrCmd_doweather, ScrCmd_setstepcallback,
  ScrCmd_setmaplayoutindex, ScrCmd_opendoor, ScrCmd_closedoor, ScrCmd_waitdooranim, ScrCmd_setdooropen,
  ScrCmd_setdoorclosed, ScrCmd_addelevmenuitem, ScrCmd_showelevmenu, ScrCmd_setvaddress, ScrCmd_vgoto, ScrCmd_vcall,
  ScrCmd_vgoto_if, ScrCmd_vcall_if, ScrCmd_incrementgamestat, ScrCmd_comparestat, ScrCmd_signmsg, ScrCmd_normalmsg,
  ScrCmd_setmonmodernfatefulencounter, ScrCmd_checkmonmodernfatefulencounter, ScrCmd_setworldmapflag,
  ScrCmd_setmonmetlocation,
};

function readWarpData(ctx: ScriptRunner) {
  const mapGroup = ctx.readByte();
  const mapNum = ctx.readByte();
  const warpId = ctx.readByte();
  const x = varGet(ctx.ScriptReadHalfword());
  const y = varGet(ctx.ScriptReadHalfword());
  return { mapGroup, mapNum, warpId: warpId === 0xff ? -1 : warpId, x: (x << 16) >> 16, y: (y << 16) >> 16 };
}

function readWarp(ctx: ScriptRunner): void {
  const w = readWarpData(ctx);
  ctx.ow.SetWarpDestination(w.mapGroup, w.mapNum, w.warpId, w.x, w.y);
}

function removeObject(ctx: ScriptRunner, localId: number): void {
  removeResolvedObject(ctx, localIdObject(ctx, localId));
}

function removeResolvedObject(ctx: ScriptRunner, o: ReturnType<typeof localIdObject>): void {
  if (!o || o.isPlayer) return;
  ctx.ow.objects.RemoveObjectEventByLocalIdAndMap(o.localId, o.mapNum, o.mapGroup);
  ctx.ow.syncObjectSprites();
}

function addObject(ctx: ScriptRunner, localId: number): void {
  const objectEventId = ctx.ow.objects.TrySpawnObjectEvent(localId, ctx.ow.objects.mapNum, ctx.ow.objects.mapGroup);
  if (objectEventId !== OBJECT_EVENTS_COUNT) ctx.ow.syncObjectSprites();
}

export { LOCALID_PLAYER, copy, EOS, tasks };
