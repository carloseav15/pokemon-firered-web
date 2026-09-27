// Port of scrcmd.c. Each command reads its arguments from the original
// assembled bytecode exactly as the C implementation does.

import { FONT_BRAILLE, stringWidth } from "../gba/font";
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { concat, copy, countDigits, encode, intToDecimal, length, stringVars, STR_CONV_MODE_LEFT_ALIGN, EOS } from "../gba/charmap";
import { paletteFade } from "../gba/fade";
import { A_BUTTON, B_BUTTON, JOY_NEW } from "../gba/input";
import { tasks } from "../gba/tasks";
import { b64, RAM_SCRIPT_BASE, rom, type MapHeader } from "../rom";
import { random } from "../random";
import { flagClear, flagGet, flagSet, incrementGameStat, save, SV, varGet, varSet } from "../save";
import { MAP_OFFSET, MAPGRID_COLLISION_MASK } from "../field/fieldmap";
import { LOCALID_PLAYER, OPPOSITE } from "../field/objectEvents";
import * as items from "../pokemon/items";
import { getBoxName } from "../pokemon/storage";
import { knowsMove, leadMonIndex, nickname, setMoveSlot, speciesName } from "../pokemon/pokemon";
import { runSpecial } from "./specials";
import { ClearPlayerHeldMovementAndUnfreezeObjectEvents, FreezeObjects_WaitForPlayer, FreezeObjects_WaitForPlayerAndSelected } from "./eventObjectLock";
import { MapPreview_SetFlag } from "../mapPreviewScreen";
import type { ScriptCommand, ScriptRunner } from "./context";
import { ClearRamScript, GetSavedRamScriptIfValid, gRamScriptRetAddr, ramScriptDataBytes, setRamScriptRetAddr } from "./context";

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

/** ScriptSetMonMoveSlot (script_pokemon_util.c); scrcmd.c stores the slot
 * before the move id, while the C helper receives the move id first. */
function ScriptSetMonMoveSlot(monIndex: number, move: number, slot: number): void {
  if (monIndex > C.PARTY_SIZE) monIndex = save.party.length - 1;
  const mon = save.party[monIndex];
  if (mon) setMoveSlot(mon, move, slot);
}

export const COMMANDS: Record<string, ScriptCommand> = {
  nop: () => false,
  nop1: () => false,
  end: (ctx) => { ctx.StopScript(); return false; },
  return: (ctx) => { ctx.ScriptReturn(); return false; },
  call: (ctx) => { const p = ctx.ScriptReadWord(); ctx.ScriptCall(p); return false; },
  goto: (ctx) => { ctx.ScriptJump(ctx.ScriptReadWord()); return false; },
  goto_if: (ctx) => { const c = ctx.readByte(); const p = ctx.ScriptReadWord(); if (cond(ctx, c)) ctx.ScriptJump(p); return false; },
  call_if: (ctx) => { const c = ctx.readByte(); const p = ctx.ScriptReadWord(); if (cond(ctx, c)) ctx.ScriptCall(p); return false; },
  gotostd: (ctx) => { const s = stdScript(ctx.readByte()); if (s) ctx.ScriptJump(s); return false; },
  callstd: (ctx) => { const s = stdScript(ctx.readByte()); if (s) ctx.ScriptCall(s); return false; },
  gotostd_if: (ctx) => { const c = ctx.readByte(); const s = stdScript(ctx.readByte()); if (cond(ctx, c) && s) ctx.ScriptJump(s); return false; },
  callstd_if: (ctx) => { const c = ctx.readByte(); const s = stdScript(ctx.readByte()); if (cond(ctx, c) && s) ctx.ScriptCall(s); return false; },
  returnram: (ctx) => { ctx.ScriptJump(gRamScriptRetAddr ?? 0); return false; },
  endram: (ctx) => { ClearRamScript(); ctx.StopScript(); return true; },
  setmysteryeventstatus: (ctx) => { ctx.readByte(); return false; },
  trywondercardscript: (ctx) => {
    const script = GetSavedRamScriptIfValid(ctx);
    if (script !== null) {
      setRamScriptRetAddr(ctx.scriptPtr);
      rom.setRamScriptBytes(ramScriptDataBytes());
      ctx.ScriptJump(RAM_SCRIPT_BASE + 4);
    }
    return false;
  },
  loadword: (ctx) => { const i = ctx.readByte(); ctx.data[i] = ctx.ScriptReadWord(); return false; },
  loadbyte: (ctx) => { const i = ctx.readByte(); ctx.data[i] = ctx.readByte(); return false; },
  loadbytefromptr: (ctx) => { const i = ctx.readByte(); ctx.data[i] = rom.u8(ctx.ScriptReadWord()); return false; },
  setptr: (ctx) => { ctx.readByte(); ctx.ScriptReadWord(); return false; },
  setptrbyte: (ctx) => { ctx.readByte(); ctx.ScriptReadWord(); return false; },
  copylocal: (ctx) => { const d = ctx.readByte(); const s = ctx.readByte(); ctx.data[d] = ctx.data[s]; return false; },
  copybyte: (ctx) => { ctx.ScriptReadWord(); ctx.ScriptReadWord(); return false; },
  setvar: (ctx) => { const v = ctx.ScriptReadHalfword(); varSet(v, ctx.ScriptReadHalfword()); return false; },
  copyvar: (ctx) => { const d = ctx.ScriptReadHalfword(); const s = ctx.ScriptReadHalfword(); varSet(d, varGet(s)); return false; },
  setorcopyvar: (ctx) => { const d = ctx.ScriptReadHalfword(); varSet(d, varGet(ctx.ScriptReadHalfword())); return false; },
  compare_local_to_local: (ctx) => { const a = ctx.data[ctx.readByte()] & 0xff; const b = ctx.data[ctx.readByte()] & 0xff; ctx.comparisonResult = compare(a, b); return false; },
  compare_local_to_value: (ctx) => { const a = ctx.data[ctx.readByte()] & 0xff; const b = ctx.readByte(); ctx.comparisonResult = compare(a, b); return false; },
  compare_local_to_ptr: (ctx) => { const a = ctx.data[ctx.readByte()] & 0xff; const b = rom.u8(ctx.ScriptReadWord()); ctx.comparisonResult = compare(a, b); return false; },
  compare_ptr_to_local: (ctx) => { const a = rom.u8(ctx.ScriptReadWord()); const b = ctx.data[ctx.readByte()] & 0xff; ctx.comparisonResult = compare(a, b); return false; },
  compare_ptr_to_value: (ctx) => { const a = rom.u8(ctx.ScriptReadWord()); const b = ctx.readByte(); ctx.comparisonResult = compare(a, b); return false; },
  compare_ptr_to_ptr: (ctx) => { const a = rom.u8(ctx.ScriptReadWord()); const b = rom.u8(ctx.ScriptReadWord()); ctx.comparisonResult = compare(a, b); return false; },
  compare_var_to_value: (ctx) => { const a = varGet(ctx.ScriptReadHalfword()); const b = ctx.ScriptReadHalfword(); ctx.comparisonResult = compare(a, b); return false; },
  compare_var_to_var: (ctx) => { const a = varGet(ctx.ScriptReadHalfword()); const b = varGet(ctx.ScriptReadHalfword()); ctx.comparisonResult = compare(a, b); return false; },
  addvar: (ctx) => { const v = ctx.ScriptReadHalfword(); varSet(v, (varGet(v) + ctx.ScriptReadHalfword()) & 0xffff); return false; },
  subvar: (ctx) => { const v = ctx.ScriptReadHalfword(); varSet(v, (varGet(v) - varGet(ctx.ScriptReadHalfword())) & 0xffff); return false; },
  random: (ctx) => { const max = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, max ? random() % max : 0); return false; },
  callnative: (ctx) => {
    const ptr = ctx.ScriptReadWord();
    const name = rom.scriptMeta.externals[ptr - rom.scriptMeta.externBase];
    runSpecial(ctx, name);
    return false;
  },
  gotonative: (ctx) => {
    const ptr = ctx.ScriptReadWord();
    const name = rom.scriptMeta.externals[ptr - rom.scriptMeta.externBase];
    ctx.SetupNativeScript(() => (runSpecial(ctx, name) ?? 1) !== 0);
    return true;
  },
  special: (ctx) => {
    const index = ctx.ScriptReadHalfword();
    runSpecial(ctx, rom.scriptMeta.specials[index]);
    return false;
  },
  specialvar: (ctx) => {
    const v = ctx.ScriptReadHalfword();
    const index = ctx.ScriptReadHalfword();
    const result = runSpecial(ctx, rom.scriptMeta.specials[index]);
    varSet(v, result ?? 0);
    return false;
  },
  waitstate: (ctx) => { ctx.ow.script.ScriptContext_Stop(); return true; },
  delay: (ctx) => {
    pauseCounter = ctx.ScriptReadHalfword();
    ctx.SetupNativeScript(() => --pauseCounter <= 0);
    return true;
  },
  setflag: (ctx) => { flagSet(ctx.ScriptReadHalfword()); return false; },
  clearflag: (ctx) => { flagClear(ctx.ScriptReadHalfword()); return false; },
  checkflag: (ctx) => { ctx.comparisonResult = flagGet(ctx.ScriptReadHalfword()) ? 1 : 0; return false; },
  initclock: (ctx) => { ctx.ScriptReadHalfword(); ctx.ScriptReadHalfword(); return false; },
  dotimebasedevents: () => false,
  gettime: () => { varSet(SV.x8000, 0); varSet(SV.x8001, 0); varSet(SV.x8002, 0); return false; },
  playse: (ctx) => { sound.playSE(ctx.ScriptReadHalfword()); return false; },
  waitse: (ctx) => { ctx.SetupNativeScript(() => !sound.isSEPlaying()); return true; },
  playfanfare: (ctx) => { sound.playFanfare(ctx.ScriptReadHalfword()); return false; },
  waitfanfare: (ctx) => { ctx.SetupNativeScript(() => sound.isFanfareTaskInactive()); return true; },
  playbgm: (ctx) => {
    const song = ctx.ScriptReadHalfword();
    const saveIt = ctx.readByte();
    if (saveIt) ctx.ow.savedMusic = song;
    sound.playNewMapMusic(song);
    return false;
  },
  savebgm: (ctx) => { ctx.ow.savedMusic = ctx.ScriptReadHalfword(); return false; },
  fadedefaultbgm: (ctx) => { const music = ctx.ow.savedMusic || ctx.ow.header.music; if (music !== sound.currentBGM) sound.playNewMapMusic(music); return false; },
  fadenewbgm: (ctx) => { const music = ctx.ScriptReadHalfword(); if (music !== sound.currentBGM) sound.playNewMapMusic(music); return false; },
  fadeoutbgm: (ctx) => {
    const speed = ctx.readByte();
    sound.fadeOutBGM(speed ? 4 * speed : 4);
    ctx.SetupNativeScript(() => sound.isBGMPausedOrStopped());
    return true;
  },
  fadeinbgm: (ctx) => { const speed = ctx.readByte(); sound.fadeInBGM(speed ? 4 * speed : 4); return false; },
  warp: (ctx) => { readWarp(ctx); ctx.ow.doWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; },
  warpsilent: (ctx) => { readWarp(ctx); ctx.ow.doDiveWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; },
  warpdoor: (ctx) => { readWarp(ctx); ctx.ow.doDoorWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; },
  warphole: (ctx) => {
    const group = ctx.readByte();
    const num = ctx.readByte();
    const p = ctx.ow.player.object;
    const x = p.currentCoords.x - MAP_OFFSET, y = p.currentCoords.y - MAP_OFFSET;
    if (group === 0x7f && num === 0x7f) {
      const fixed = ctx.ow.fixedHoleWarp;
      if (fixed.mapGroup === 0x7f || fixed.mapGroup === 0xff) ctx.ow.warpDestination = { ...ctx.ow.lastUsedWarp };
      else ctx.ow.setWarpDestination(fixed.mapGroup, fixed.mapNum, -1, x, y);
    } else {
      ctx.ow.setWarpDestination(group, num, -1, x, y);
    }
    ctx.ow.doFallWarp();
    ctx.ow.resetInitialPlayerAvatarState();
    return true;
  },
  warpteleport: (ctx) => { readWarp(ctx); ctx.ow.doTeleportWarp(); ctx.ow.resetInitialPlayerAvatarState(); return true; },
  warpspinenter: (ctx) => { readWarp(ctx); ctx.ow.setInitialPlayerAvatarStateWithDirection(ctx.ow.player.object.facingDirection); ctx.ow.doTeleportWarp(); return true; },
  setwarp: (ctx) => { readWarp(ctx); return false; },
  setdynamicwarp: (ctx) => { const w = readWarpData(ctx); save.dynamicWarp = w; return false; },
  setdivewarp: (ctx) => { ctx.ow.fixedDiveWarp = readWarpData(ctx); return false; },
  setholewarp: (ctx) => { ctx.ow.fixedHoleWarp = readWarpData(ctx); return false; },
  setescapewarp: (ctx) => { save.escapeWarp = readWarpData(ctx); return false; },
  getplayerxy: (ctx) => {
    const vx = ctx.ScriptReadHalfword();
    const vy = ctx.ScriptReadHalfword();
    varSet(vx, save.pos.x);
    varSet(vy, save.pos.y);
    return false;
  },
  getpartysize: () => { varSet(SV.RESULT, save.party.length); return false; },
  additem: (ctx) => {
    const i = varGet(ctx.ScriptReadHalfword());
    const q = varGet(ctx.ScriptReadHalfword());
    varSet(SV.RESULT, items.addBagItem(i, q & 0xff) ? 1 : 0);
    items.TrySetObtainedItemQuestLogEvent(i, ctx.ow.header.regionMapSection);
    return false;
  },
  removeitem: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.removeBagItem(i, q & 0xff) ? 1 : 0); return false; },
  checkitemspace: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.checkBagHasSpace(i, q & 0xff) ? 1 : 0); return false; },
  checkitem: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.checkBagHasItem(i, q & 0xff) ? 1 : 0); return false; },
  checkitemtype: (ctx) => { varSet(SV.RESULT, items.itemPocket(varGet(ctx.ScriptReadHalfword()))); return false; },
  addpcitem: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.addPCItem(i, q) ? 1 : 0); return false; },
  checkpcitem: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); const q = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, items.checkPCHasItem(i, q) ? 1 : 0); return false; },
  adddecoration: (ctx) => { ctx.ScriptReadHalfword(); return false; },
  removedecoration: (ctx) => { ctx.ScriptReadHalfword(); return false; },
  checkdecor: (ctx) => { ctx.ScriptReadHalfword(); return false; },
  checkdecorspace: (ctx) => { ctx.ScriptReadHalfword(); return false; },
  applymovement: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    const ptr = ctx.ScriptReadWord();
    ctx.ow.game.scriptMovement.start(ctx.ow.objects.byLocalIdAndMap(localId, save.location.mapNum, save.location.mapGroup), ptr);
    movingNpcId = localId;
    return false;
  },
  applymovementat: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    const ptr = ctx.ScriptReadWord();
    const mapGroup = ctx.readByte();
    const mapNum = ctx.readByte();
    ctx.ow.game.scriptMovement.start(ctx.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup), ptr);
    movingNpcId = localId;
    return false;
  },
  waitmovement: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    if (localId !== 0) movingNpcId = localId;
    const id = movingNpcId;
    const { mapNum, mapGroup } = save.location;
    ctx.SetupNativeScript(() => ctx.ow.game.scriptMovement.isFinished(ctx.ow.objects.byLocalIdAndMap(id, mapNum, mapGroup)));
    return true;
  },
  waitmovementat: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    if (localId !== 0) movingNpcId = localId;
    const mapGroup = ctx.readByte();
    const mapNum = ctx.readByte();
    const id = movingNpcId;
    ctx.SetupNativeScript(() => ctx.ow.game.scriptMovement.isFinished(ctx.ow.objects.byLocalIdAndMap(id, mapNum, mapGroup)));
    return true;
  },
  removeobject: (ctx) => { removeObject(ctx, varGet(ctx.ScriptReadHalfword())); return false; },
  removeobjectat: (ctx) => { removeResolvedObject(ctx, readObjectAt(ctx)); return false; },
  addobject: (ctx) => { addObject(ctx, varGet(ctx.ScriptReadHalfword())); return false; },
  addobjectat: (ctx) => {
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
  },
  setobjectxy: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    const x = varGet(ctx.ScriptReadHalfword());
    const y = varGet(ctx.ScriptReadHalfword());
    const o = localIdObject(ctx, localId);
    if (o) {
      const vx = (x << 16 >> 16) + MAP_OFFSET, vy = (y << 16 >> 16) + MAP_OFFSET;
      o.previousCoords = { x: vx, y: vy };
      o.currentCoords = { x: vx, y: vy };
      o.initialCoords = { x: vx, y: vy };
      ctx.ow.objects.placeSprite(o);
      ctx.ow.objects.updateMetatileBehaviors(o);
      if (o.isPlayer) ctx.ow.updateCameraPixels();
    }
    return false;
  },
  setobjectxyperm: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    const x = varGet(ctx.ScriptReadHalfword());
    const y = varGet(ctx.ScriptReadHalfword());
    const t = ctx.ow.objects.templates.find((tt) => tt.localId === localId);
    if (t) { t.x = x << 16 >> 16; t.y = y << 16 >> 16; }
    return false;
  },
  copyobjectxytoperm: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    const o = localIdObject(ctx, localId);
    if (o) ctx.ow.objects.overrideTemplateCoords(o);
    return false;
  },
  showobjectat: (ctx) => { const o = readObjectAt(ctx); if (o) o.invisible = false; return false; },
  hideobjectat: (ctx) => { const o = readObjectAt(ctx); if (o) o.invisible = true; return false; },
  setobjectsubpriority: (ctx) => {
    const o = readObjectAt(ctx);
    const p = ctx.readByte();
    if (o) { o.fixedPriority = true; o.sprite.subpriority = (p + 83) & 0xff; }
    return false;
  },
  resetobjectsubpriority: (ctx) => {
    const o = readObjectAt(ctx);
    if (o) { o.fixedPriority = false; o.triggerGroundEffectsOnMove = true; }
    return false;
  },
  faceplayer: (ctx) => {
    const o = selected(ctx);
    if (o && o.active) ctx.ow.objects.turn(o, OPPOSITE[ctx.ow.player.object.facingDirection]);
    return false;
  },
  turnobject: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    const direction = ctx.readByte();
    const o = localIdObject(ctx, localId);
    if (o) ctx.ow.objects.turn(o, direction);
    return false;
  },
  setobjectmovementtype: (ctx) => {
    const localId = varGet(ctx.ScriptReadHalfword());
    const type = ctx.readByte();
    const t = ctx.ow.objects.templates.find((tt) => tt.localId === localId);
    if (t) t.movementType = type;
    return false;
  },
  createvobject: (ctx) => {
    const gfx = ctx.readByte(); const id = ctx.readByte(); const x = varGet(ctx.ScriptReadHalfword()); const y = varGet(ctx.ScriptReadHalfword()); const elevation = ctx.readByte(); const dir = ctx.readByte();
    ctx.ow.game.createVirtualObject(gfx, id, x, y, elevation, dir);
    return false;
  },
  turnvobject: (ctx) => { const id = ctx.readByte(); const dir = ctx.readByte(); ctx.ow.game.turnVirtualObject(id, dir); return false; },
  lockall: (ctx) => {
    FreezeObjects_WaitForPlayer(ctx);
    return true;
  },
  lock: (ctx) => {
    const o = selected(ctx);
    if (o && o.active && !o.isPlayer) {
      FreezeObjects_WaitForPlayerAndSelected(ctx);
    } else {
      FreezeObjects_WaitForPlayer(ctx);
    }
    return true;
  },
  releaseall: (ctx) => {
    ctx.ow.messageBox.hide();
    ClearPlayerHeldMovementAndUnfreezeObjectEvents(ctx);
    return false;
  },
  release: (ctx) => {
    ctx.ow.messageBox.hide();
    const o = selected(ctx);
    if (o && o.active) ctx.ow.objects.ObjectEventClearHeldMovementIfFinished(o);
    ClearPlayerHeldMovementAndUnfreezeObjectEvents(ctx);
    return false;
  },
  textcolor: (ctx) => { varSet(SV.PREV_TEXT_COLOR, varGet(SV.TEXT_COLOR)); varSet(SV.TEXT_COLOR, ctx.readByte()); return false; },
  message: (ctx) => { ctx.ow.messageBox.show(rom.stringAt(textPtr(ctx))); return false; },
  messageautoscroll: (ctx) => { ctx.ow.messageBox.show(rom.stringAt(textPtr(ctx)), true); return false; },
  vmessage: (ctx) => { ctx.ow.messageBox.show(rom.stringAt(ctx.ScriptReadWord() - addressOffset)); return false; },
  loadhelp: (ctx) => { textPtr(ctx); return false; },
  unloadhelp: () => false,
  waitmessage: (ctx) => { ctx.SetupNativeScript(() => ctx.ow.messageBox.isHidden()); return true; },
  closemessage: (ctx) => { ctx.ow.messageBox.hide(); return false; },
  waitbuttonpress: (ctx) => { ctx.SetupNativeScript(() => JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)); return true; },
  yesnobox: (ctx) => {
    const left = ctx.readByte();
    const top = ctx.readByte();
    if (ctx.ow.game.scriptMenu.yesNo(left, top)) { ctx.ow.script.ScriptContext_Stop(); return true; }
    return false;
  },
  multichoice: (ctx) => {
    const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const ignoreB = ctx.readByte();
    if (ctx.ow.game.scriptMenu.multichoice(left, top, id, ignoreB !== 0, 0)) { ctx.ow.script.ScriptContext_Stop(); return true; }
    return false;
  },
  multichoicedefault: (ctx) => {
    const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const def = ctx.readByte(); const ignoreB = ctx.readByte();
    if (ctx.ow.game.scriptMenu.multichoice(left, top, id, ignoreB !== 0, def)) { ctx.ow.script.ScriptContext_Stop(); return true; }
    return false;
  },
  multichoicegrid: (ctx) => {
    const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const cols = ctx.readByte(); const ignoreB = ctx.readByte();
    if (ctx.ow.game.scriptMenu.multichoiceGrid(left, top, id, ignoreB !== 0, cols)) { ctx.ow.script.ScriptContext_Stop(); return true; }
    return false;
  },
  drawbox: () => false,
  erasebox: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.readByte(); ctx.readByte(); return false; },
  drawboxtext: () => false,
  showmonpic: (ctx) => {
    const species = varGet(ctx.ScriptReadHalfword());
    const x = ctx.readByte(); const y = ctx.readByte();
    ctx.ow.game.scriptMenu.showMonPic(species, x, y);
    sound.playCry(species, 0);
    return false;
  },
  hidemonpic: (ctx) => {
    const wait = ctx.ow.game.scriptMenu.hideMonPic();
    if (!wait) return false;
    ctx.SetupNativeScript(wait);
    return true;
  },
  showcontestpainting: (ctx) => { ctx.readByte(); return false; },
  braillemessage: (ctx) => { ctx.ow.messageBox.showBraille(rom.stringAt(textPtr(ctx))); return false; },
  getbraillestringwidth: (ctx) => { varSet(SV.x8004, stringWidth(FONT_BRAILLE, rom.stringAt(textPtr(ctx)), -1)); return false; },
  bufferspeciesname: (ctx) => { const i = ctx.readByte(); stringVarSet(i, speciesName(varGet(ctx.ScriptReadHalfword()))); return false; },
  bufferleadmonspeciesname: (ctx) => { const i = ctx.readByte(); const mon = save.party[leadMonIndex()]; stringVarSet(i, speciesName(mon?.species ?? 0)); return false; },
  bufferpartymonnick: (ctx) => { const i = ctx.readByte(); const idx = varGet(ctx.ScriptReadHalfword()); const mon = save.party[idx]; stringVarSet(i, mon ? nickname(mon) : encode("")); return false; },
  bufferitemname: (ctx) => { const i = ctx.readByte(); stringVarSet(i, items.itemName(varGet(ctx.ScriptReadHalfword()))); return false; },
  bufferitemnameplural: (ctx) => {
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
  },
  bufferdecorationname: (ctx) => { ctx.readByte(); ctx.ScriptReadHalfword(); return false; },
  buffermovename: (ctx) => { const i = ctx.readByte(); stringVarSet(i, b64(rom.moves[varGet(ctx.ScriptReadHalfword())]?.name ?? rom.moves[0].name)); return false; },
  buffernumberstring: (ctx) => { const i = ctx.readByte(); const n = varGet(ctx.ScriptReadHalfword()); stringVarSet(i, intToDecimal(n, STR_CONV_MODE_LEFT_ALIGN, countDigits(n))); return false; },
  bufferstdstring: (ctx) => {
    const i = ctx.readByte();
    const index = varGet(ctx.ScriptReadHalfword());
    const sym = rom.scriptMenu.stdStrings[index];
    stringVarSet(i, sym ? rom.text(sym) : encode(""));
    return false;
  },
  bufferstring: (ctx) => { const i = ctx.readByte(); stringVarSet(i, rom.stringAt(ctx.ScriptReadWord())); return false; },
  vbuffermessage: (ctx) => { stringVars.var4 = rom.stringAt(ctx.ScriptReadWord() - addressOffset); return false; },
  vbufferstring: (ctx) => { const i = ctx.readByte(); stringVarSet(i, rom.stringAt(ctx.ScriptReadWord() - addressOffset)); return false; },
  // scrcmd.c ScrCmd_bufferboxname copies GetBoxNamePtr, including custom names.
  bufferboxname: (ctx) => {
    const i = ctx.readByte();
    const box = varGet(ctx.ScriptReadHalfword());
    stringVarSet(i, getBoxName(box));
    return false;
  },
  givemon: (ctx) => {
    const species = varGet(ctx.ScriptReadHalfword());
    const level = ctx.readByte();
    const item = varGet(ctx.ScriptReadHalfword());
    ctx.ScriptReadWord(); ctx.ScriptReadWord(); ctx.readByte();
    varSet(SV.RESULT, ctx.ow.game.scriptGiveMon(species, level, item));
    return false;
  },
  giveegg: (ctx) => { const species = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, ctx.ow.game.scriptGiveEgg(species)); return false; },
  setmonmove: (ctx) => {
    const partyIndex = ctx.readByte(); const slot = ctx.readByte(); const move = ctx.ScriptReadHalfword();
    ScriptSetMonMoveSlot(partyIndex, move, slot);
    return false;
  },
  checkpartymove: (ctx) => {
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
  },
  addmoney: (ctx) => { const amount = ctx.ScriptReadWord(); const ignore = ctx.readByte(); if (!ignore) items.addMoney(amount); return false; },
  removemoney: (ctx) => { const amount = ctx.ScriptReadWord(); const ignore = ctx.readByte(); if (!ignore) items.removeMoney(amount); return false; },
  checkmoney: (ctx) => { const amount = ctx.ScriptReadWord(); const ignore = ctx.readByte(); if (!ignore) varSet(SV.RESULT, items.isEnoughMoney(amount) ? 1 : 0); return false; },
  showmoneybox: (ctx) => { const x = ctx.readByte(); const y = ctx.readByte(); const ignore = ctx.readByte(); if (!ignore) ctx.ow.game.scriptMenu.showMoneyBox(x, y); return false; },
  hidemoneybox: (ctx) => { ctx.ow.game.scriptMenu.hideMoneyBox(); return false; },
  updatemoneybox: (ctx) => { ctx.readByte(); ctx.readByte(); const ignore = ctx.readByte(); if (!ignore) ctx.ow.game.scriptMenu.updateMoneyBox(); return false; },
  showcoinsbox: (ctx) => { const x = ctx.readByte(); const y = ctx.readByte(); ctx.ow.game.scriptMenu.showCoinsBox(x, y); return false; },
  hidecoinsbox: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.ow.game.scriptMenu.hideCoinsBox(); return false; },
  updatecoinsbox: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.ow.game.scriptMenu.updateCoinsBox(); return false; },
  checkcoins: (ctx) => { varSet(ctx.ScriptReadHalfword(), items.GetCoins()); return false; },
  addcoins: (ctx) => { varSet(SV.RESULT, items.addCoins(varGet(ctx.ScriptReadHalfword())) ? 0 : 1); return false; },
  removecoins: (ctx) => { varSet(SV.RESULT, items.removeCoins(varGet(ctx.ScriptReadHalfword())) ? 0 : 1); return false; },
  trainerbattle: (ctx) => { ctx.scriptPtr = ctx.ow.game.battleSetup.configureTrainerBattle(ctx.scriptPtr); return false; },
  dotrainerbattle: (ctx) => { ctx.ow.game.battleSetup.startTrainerBattle(); return true; },
  gotopostbattlescript: (ctx) => { ctx.scriptPtr = ctx.ow.game.battleSetup.scriptAddrAfterBattle(); return false; },
  gotobeatenscript: (ctx) => { ctx.scriptPtr = ctx.ow.game.battleSetup.trainerPostBattleScript(); return false; },
  checktrainerflag: (ctx) => { ctx.comparisonResult = ctx.ow.game.battleSetup.hasTrainerBeenFought(varGet(ctx.ScriptReadHalfword())) ? 1 : 0; return false; },
  settrainerflag: (ctx) => { ctx.ow.game.battleSetup.setTrainerFlag(varGet(ctx.ScriptReadHalfword())); return false; },
  cleartrainerflag: (ctx) => { ctx.ow.game.battleSetup.clearTrainerFlag(varGet(ctx.ScriptReadHalfword())); return false; },
  setwildbattle: (ctx) => {
    const species = ctx.ScriptReadHalfword(); const level = ctx.readByte(); const item = ctx.ScriptReadHalfword();
    ctx.ow.game.battleSetup.createScriptedWildMon(species, level, item);
    return false;
  },
  dowildbattle: (ctx) => { ctx.ow.game.battleSetup.startScriptedWildBattle(); ctx.ow.script.ScriptContext_Stop(); return true; },
  pokemart: (ctx) => { const ptr = ctx.ScriptReadWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.ScriptContext_Stop(); return true; },
  pokemartdecoration: (ctx) => { const ptr = ctx.ScriptReadWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.ScriptContext_Stop(); return true; },
  pokemartdecoration2: (ctx) => { const ptr = ctx.ScriptReadWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.ScriptContext_Stop(); return true; },
  playslotmachine: (ctx) => { const id = varGet(ctx.ScriptReadHalfword()); ctx.ow.game.playSlotMachine(id); ctx.ow.script.ScriptContext_Stop(); return true; },
  setberrytree: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.readByte(); return false; },
  choosecontestmon: (ctx) => { ctx.ow.script.ScriptContext_Stop(); return true; },
  startcontest: () => false,
  showcontestresults: () => false,
  contestlinktransfer: () => false,
  getpokenewsactive: (ctx) => { ctx.ScriptReadHalfword(); return false; },
  fadescreen: (ctx) => {
    paletteFade.fadeScreen(ctx.readByte(), 0);
    ctx.SetupNativeScript(() => !paletteFade.active);
    return true;
  },
  fadescreenspeed: (ctx) => {
    const mode = ctx.readByte();
    const speed = ctx.readByte();
    paletteFade.fadeScreen(mode, speed);
    ctx.SetupNativeScript(() => !paletteFade.active);
    return true;
  },
  setflashlevel: (ctx) => { const level = varGet(ctx.ScriptReadHalfword()); ctx.ow.flashLevel = level < 0 || level > 4 ? 0 : level; return false; },
  animateflash: (ctx) => {
    const target = ctx.readByte();
    ctx.ow.game.animateFlash(target);
    ctx.ow.script.ScriptContext_Stop();
    return true;
  },
  dofieldeffect: (ctx) => { fieldEffectScriptId = varGet(ctx.ScriptReadHalfword()); ctx.ow.game.fieldEffectStart(fieldEffectScriptId); return false; },
  setfieldeffectargument: (ctx) => { const n = ctx.readByte(); ctx.ow.game.fieldEffectArguments[n] = (varGet(ctx.ScriptReadHalfword()) << 16) >> 16; return false; },
  waitfieldeffect: (ctx) => {
    fieldEffectScriptId = varGet(ctx.ScriptReadHalfword());
    const id = fieldEffectScriptId;
    ctx.SetupNativeScript(() => !ctx.ow.effects.active.has(id));
    return true;
  },
  setrespawn: (ctx) => { ctx.ow.setLastHealLocationWarp(varGet(ctx.ScriptReadHalfword())); return false; },
  checkplayergender: () => { varSet(SV.RESULT, save.playerGender); return false; },
  playmoncry: (ctx) => { const species = varGet(ctx.ScriptReadHalfword()); const mode = varGet(ctx.ScriptReadHalfword()); sound.playCry(species, mode); return false; },
  waitmoncry: (ctx) => { ctx.SetupNativeScript(() => sound.isCryFinished()); return true; },
  setmetatile: (ctx) => {
    const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
    const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
    const metatile = varGet(ctx.ScriptReadHalfword());
    const impassable = varGet(ctx.ScriptReadHalfword());
    ctx.ow.map.setMetatileIdAt(x, y, impassable ? metatile | MAPGRID_COLLISION_MASK : metatile);
    return false;
  },
  resetweather: (ctx) => { ctx.ow.game.weather.SetSavedWeatherFromCurrMapHeader(ctx.ow.header.weather); return false; },
  setweather: (ctx) => { ctx.ow.game.weather.setWeather(varGet(ctx.ScriptReadHalfword())); return false; },
  doweather: (ctx) => { ctx.ow.game.weather.DoCurrentWeather(); return false; },
  setstepcallback: (ctx) => { ctx.ow.game.setStepCallback(ctx.readByte()); return false; },
  setmaplayoutindex: (ctx) => { ctx.ow.game.setMapLayoutIndex(varGet(ctx.ScriptReadHalfword())); return false; },
  opendoor: (ctx) => {
    const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
    const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET;
    sound.playSE(ctx.ow.doors.GetDoorSoundEffect(x, y));
    ctx.ow.doors.FieldAnimateDoorOpen(x, y);
    return false;
  },
  closedoor: (ctx) => { const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; ctx.ow.doors.FieldAnimateDoorClose(x, y); return false; },
  waitdooranim: (ctx) => { ctx.SetupNativeScript(() => !ctx.ow.doors.FieldIsDoorAnimationRunning()); return true; },
  setdooropen: (ctx) => { const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; ctx.ow.doors.FieldSetDoorOpened(x, y); return false; },
  setdoorclosed: (ctx) => { const x = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; const y = varGet(ctx.ScriptReadHalfword()) + MAP_OFFSET; ctx.ow.doors.FieldSetDoorClosed(x, y); return false; },
  addelevmenuitem: () => false,
  showelevmenu: () => false,
  setvaddress: (ctx) => { const addr1 = ctx.scriptPtr - 1; const addr2 = ctx.ScriptReadWord(); addressOffset = addr2 - addr1; return false; },
  vgoto: (ctx) => { ctx.ScriptJump(ctx.ScriptReadWord() - addressOffset); return false; },
  vcall: (ctx) => { ctx.ScriptCall(ctx.ScriptReadWord() - addressOffset); return false; },
  vgoto_if: (ctx) => { const c = ctx.readByte(); const p = ctx.ScriptReadWord() - addressOffset; if (cond(ctx, c)) ctx.ScriptJump(p); return false; },
  vcall_if: (ctx) => { const c = ctx.readByte(); const p = ctx.ScriptReadWord() - addressOffset; if (cond(ctx, c)) ctx.ScriptCall(p); return false; },
  incrementgamestat: (ctx) => { incrementGameStat(ctx.readByte()); return false; },
  comparestat: (ctx) => {
    const stat = ctx.readByte();
    const value = ctx.ScriptReadWord();
    ctx.comparisonResult = compare(save.gameStats[stat] ?? 0, value);
    return false;
  },
  signmsg: (ctx) => { ctx.ow.control.MsgSetSignpost(); return false; },
  normalmsg: (ctx) => { ctx.ow.control.MsgSetNotSignpost(); return false; },
  setmonmodernfatefulencounter: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); if (save.party[i]) save.party[i].modernFatefulEncounter = true; return false; },
  checkmonmodernfatefulencounter: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); varSet(SV.RESULT, save.party[i]?.modernFatefulEncounter ? 1 : 0); return false; },
  setworldmapflag: (ctx) => { MapPreview_SetFlag(ctx.ScriptReadHalfword()); return false; },
  setmonmetlocation: (ctx) => { const i = varGet(ctx.ScriptReadHalfword()); const loc = ctx.readByte(); if (save.party[i]) save.party[i].metLocation = loc; return false; },
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
  ctx.ow.warpDestination = w;
}

function removeObject(ctx: ScriptRunner, localId: number): void {
  removeResolvedObject(ctx, localIdObject(ctx, localId));
}

function removeResolvedObject(ctx: ScriptRunner, o: ReturnType<typeof localIdObject>): void {
  if (!o || o.isPlayer) return;
  const flag = o.template?.flag;
  if (flag) flagSet(flag);
  ctx.ow.objects.remove(o);
  ctx.ow.syncObjectSprites();
}

function addObject(ctx: ScriptRunner, localId: number): void {
  const template = ctx.ow.objects.templates.find((t) => t.localId === localId);
  if (!template) return;
  const o = ctx.ow.objects.spawnFromTemplate(template);
  if (o) ctx.ow.syncObjectSprites();
}

export { LOCALID_PLAYER, copy, EOS, tasks };
