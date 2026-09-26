// Port of scrcmd.c. Each command reads its arguments from the original
// assembled bytecode exactly as the C implementation does.

import { FONT_BRAILLE, stringWidth } from "../gba/font";
import { sound } from "../audio/sound";
import { concat, copy, countDigits, encode, intToDecimal, length, stringVars, STR_CONV_MODE_LEFT_ALIGN, EOS } from "../gba/charmap";
import { paletteFade } from "../gba/fade";
import { A_BUTTON, B_BUTTON, JOY_NEW } from "../gba/input";
import { tasks } from "../gba/tasks";
import { b64, rom, type MapHeader } from "../rom";
import { random } from "../random";
import { flagClear, flagGet, flagSet, incrementGameStat, save, SV, varGet, varSet } from "../save";
import { MAP_OFFSET, MAPGRID_COLLISION_MASK } from "../field/fieldmap";
import { LOCALID_PLAYER, OPPOSITE } from "../field/objectEvents";
import { T_TILE_TRANSITION } from "../field/playerAvatar";
import * as items from "../pokemon/items";
import { getBoxName } from "../pokemon/storage";
import { knowsMove, leadMonIndex, nickname, setMoveSlot, speciesName } from "../pokemon/pokemon";
import { runSpecial } from "./specials";
import { MapPreview_SetFlag } from "../mapPreviewScreen";
import type { ScriptCommand, ScriptRunner } from "./context";

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
  const ptr = ctx.readWord();
  return ptr || ctx.data[0];
}

function localIdObject(ctx: ScriptRunner, localId: number) {
  return ctx.ow.objects.byLocalIdAndMap(localId, save.location.mapNum, save.location.mapGroup);
}

/** Map-qualified commands encode the group before the map number. */
function readObjectAt(ctx: ScriptRunner) {
  const localId = varGet(ctx.readHalfword());
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

export const COMMANDS: Record<string, ScriptCommand> = {
  nop: () => false,
  nop1: () => false,
  end: (ctx) => { ctx.stop(); return false; },
  return: (ctx) => { ctx.ret(); return false; },
  call: (ctx) => { const p = ctx.readWord(); ctx.call(p); return false; },
  goto: (ctx) => { ctx.jump(ctx.readWord()); return false; },
  goto_if: (ctx) => { const c = ctx.readByte(); const p = ctx.readWord(); if (cond(ctx, c)) ctx.jump(p); return false; },
  call_if: (ctx) => { const c = ctx.readByte(); const p = ctx.readWord(); if (cond(ctx, c)) ctx.call(p); return false; },
  gotostd: (ctx) => { const s = stdScript(ctx.readByte()); if (s) ctx.jump(s); return false; },
  callstd: (ctx) => { const s = stdScript(ctx.readByte()); if (s) ctx.call(s); return false; },
  gotostd_if: (ctx) => { const c = ctx.readByte(); const s = stdScript(ctx.readByte()); if (cond(ctx, c) && s) ctx.jump(s); return false; },
  callstd_if: (ctx) => { const c = ctx.readByte(); const s = stdScript(ctx.readByte()); if (cond(ctx, c) && s) ctx.call(s); return false; },
  returnram: (ctx) => { ctx.stop(); return false; },
  endram: (ctx) => { ctx.stop(); return true; },
  setmysteryeventstatus: (ctx) => { ctx.readByte(); return false; },
  trywondercardscript: () => false,
  loadword: (ctx) => { const i = ctx.readByte(); ctx.data[i] = ctx.readWord(); return false; },
  loadbyte: (ctx) => { const i = ctx.readByte(); ctx.data[i] = ctx.readByte(); return false; },
  loadbytefromptr: (ctx) => { const i = ctx.readByte(); ctx.data[i] = rom.u8(ctx.readWord()); return false; },
  setptr: (ctx) => { ctx.readByte(); ctx.readWord(); return false; },
  setptrbyte: (ctx) => { ctx.readByte(); ctx.readWord(); return false; },
  copylocal: (ctx) => { const d = ctx.readByte(); const s = ctx.readByte(); ctx.data[d] = ctx.data[s]; return false; },
  copybyte: (ctx) => { ctx.readWord(); ctx.readWord(); return false; },
  setvar: (ctx) => { const v = ctx.readHalfword(); varSet(v, ctx.readHalfword()); return false; },
  copyvar: (ctx) => { const d = ctx.readHalfword(); const s = ctx.readHalfword(); varSet(d, varGet(s)); return false; },
  setorcopyvar: (ctx) => { const d = ctx.readHalfword(); varSet(d, varGet(ctx.readHalfword())); return false; },
  compare_local_to_local: (ctx) => { const a = ctx.data[ctx.readByte()] & 0xff; const b = ctx.data[ctx.readByte()] & 0xff; ctx.comparisonResult = compare(a, b); return false; },
  compare_local_to_value: (ctx) => { const a = ctx.data[ctx.readByte()] & 0xff; const b = ctx.readByte(); ctx.comparisonResult = compare(a, b); return false; },
  compare_local_to_ptr: (ctx) => { const a = ctx.data[ctx.readByte()] & 0xff; const b = rom.u8(ctx.readWord()); ctx.comparisonResult = compare(a, b); return false; },
  compare_ptr_to_local: (ctx) => { const a = rom.u8(ctx.readWord()); const b = ctx.data[ctx.readByte()] & 0xff; ctx.comparisonResult = compare(a, b); return false; },
  compare_ptr_to_value: (ctx) => { const a = rom.u8(ctx.readWord()); const b = ctx.readByte(); ctx.comparisonResult = compare(a, b); return false; },
  compare_ptr_to_ptr: (ctx) => { const a = rom.u8(ctx.readWord()); const b = rom.u8(ctx.readWord()); ctx.comparisonResult = compare(a, b); return false; },
  compare_var_to_value: (ctx) => { const a = varGet(ctx.readHalfword()); const b = ctx.readHalfword(); ctx.comparisonResult = compare(a, b); return false; },
  compare_var_to_var: (ctx) => { const a = varGet(ctx.readHalfword()); const b = varGet(ctx.readHalfword()); ctx.comparisonResult = compare(a, b); return false; },
  addvar: (ctx) => { const v = ctx.readHalfword(); varSet(v, (varGet(v) + ctx.readHalfword()) & 0xffff); return false; },
  subvar: (ctx) => { const v = ctx.readHalfword(); varSet(v, (varGet(v) - varGet(ctx.readHalfword())) & 0xffff); return false; },
  random: (ctx) => { const max = varGet(ctx.readHalfword()); varSet(SV.RESULT, max ? random() % max : 0); return false; },
  callnative: (ctx) => {
    const ptr = ctx.readWord();
    const name = rom.scriptMeta.externals[ptr - rom.scriptMeta.externBase];
    runSpecial(ctx, name);
    return false;
  },
  gotonative: (ctx) => {
    const ptr = ctx.readWord();
    const name = rom.scriptMeta.externals[ptr - rom.scriptMeta.externBase];
    ctx.setupNative(() => (runSpecial(ctx, name) ?? 1) !== 0);
    return true;
  },
  special: (ctx) => {
    const index = ctx.readHalfword();
    runSpecial(ctx, rom.scriptMeta.specials[index]);
    return false;
  },
  specialvar: (ctx) => {
    const v = ctx.readHalfword();
    const index = ctx.readHalfword();
    const result = runSpecial(ctx, rom.scriptMeta.specials[index]);
    varSet(v, result ?? 0);
    return false;
  },
  waitstate: (ctx) => { ctx.ow.script.stop(); return true; },
  delay: (ctx) => {
    pauseCounter = ctx.readHalfword();
    ctx.setupNative(() => --pauseCounter <= 0);
    return true;
  },
  setflag: (ctx) => { flagSet(ctx.readHalfword()); return false; },
  clearflag: (ctx) => { flagClear(ctx.readHalfword()); return false; },
  checkflag: (ctx) => { ctx.comparisonResult = flagGet(ctx.readHalfword()) ? 1 : 0; return false; },
  initclock: (ctx) => { ctx.readHalfword(); ctx.readHalfword(); return false; },
  dotimebasedevents: () => false,
  gettime: () => { varSet(SV.x8000, 0); varSet(SV.x8001, 0); varSet(SV.x8002, 0); return false; },
  playse: (ctx) => { sound.playSE(ctx.readHalfword()); return false; },
  waitse: (ctx) => { ctx.setupNative(() => !sound.isSEPlaying()); return true; },
  playfanfare: (ctx) => { sound.playFanfare(ctx.readHalfword()); return false; },
  waitfanfare: (ctx) => { ctx.setupNative(() => sound.isFanfareTaskInactive()); return true; },
  playbgm: (ctx) => {
    const song = ctx.readHalfword();
    const saveIt = ctx.readByte();
    if (saveIt) ctx.ow.savedMusic = song;
    sound.playNewMapMusic(song);
    return false;
  },
  savebgm: (ctx) => { ctx.ow.savedMusic = ctx.readHalfword(); return false; },
  fadedefaultbgm: (ctx) => { const music = ctx.ow.savedMusic || ctx.ow.header.music; if (music !== sound.currentBGM) sound.playNewMapMusic(music); return false; },
  fadenewbgm: (ctx) => { const music = ctx.readHalfword(); if (music !== sound.currentBGM) sound.playNewMapMusic(music); return false; },
  fadeoutbgm: (ctx) => {
    const speed = ctx.readByte();
    sound.fadeOutBGM(speed ? 4 * speed : 4);
    ctx.setupNative(() => sound.isBGMPausedOrStopped());
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
    const vx = ctx.readHalfword();
    const vy = ctx.readHalfword();
    varSet(vx, save.pos.x);
    varSet(vy, save.pos.y);
    return false;
  },
  getpartysize: () => { varSet(SV.RESULT, save.party.length); return false; },
  additem: (ctx) => { const i = varGet(ctx.readHalfword()); const q = varGet(ctx.readHalfword()); varSet(SV.RESULT, items.addBagItem(i, q & 0xff) ? 1 : 0); return false; },
  removeitem: (ctx) => { const i = varGet(ctx.readHalfword()); const q = varGet(ctx.readHalfword()); varSet(SV.RESULT, items.removeBagItem(i, q & 0xff) ? 1 : 0); return false; },
  checkitemspace: (ctx) => { const i = varGet(ctx.readHalfword()); const q = varGet(ctx.readHalfword()); varSet(SV.RESULT, items.checkBagHasSpace(i, q & 0xff) ? 1 : 0); return false; },
  checkitem: (ctx) => { const i = varGet(ctx.readHalfword()); const q = varGet(ctx.readHalfword()); varSet(SV.RESULT, items.checkBagHasItem(i, q & 0xff) ? 1 : 0); return false; },
  checkitemtype: (ctx) => { varSet(SV.RESULT, items.itemPocket(varGet(ctx.readHalfword()))); return false; },
  addpcitem: (ctx) => { const i = varGet(ctx.readHalfword()); const q = varGet(ctx.readHalfword()); varSet(SV.RESULT, items.addPCItem(i, q) ? 1 : 0); return false; },
  checkpcitem: (ctx) => { const i = varGet(ctx.readHalfword()); const q = varGet(ctx.readHalfword()); varSet(SV.RESULT, items.checkPCHasItem(i, q) ? 1 : 0); return false; },
  adddecoration: (ctx) => { ctx.readHalfword(); return false; },
  removedecoration: (ctx) => { ctx.readHalfword(); return false; },
  checkdecor: (ctx) => { ctx.readHalfword(); return false; },
  checkdecorspace: (ctx) => { ctx.readHalfword(); return false; },
  applymovement: (ctx) => {
    const localId = varGet(ctx.readHalfword());
    const ptr = ctx.readWord();
    ctx.ow.game.scriptMovement.start(ctx.ow.objects.byLocalIdAndMap(localId, save.location.mapNum, save.location.mapGroup), ptr);
    movingNpcId = localId;
    return false;
  },
  applymovementat: (ctx) => {
    const localId = varGet(ctx.readHalfword());
    const ptr = ctx.readWord();
    const mapGroup = ctx.readByte();
    const mapNum = ctx.readByte();
    ctx.ow.game.scriptMovement.start(ctx.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup), ptr);
    movingNpcId = localId;
    return false;
  },
  waitmovement: (ctx) => {
    const localId = varGet(ctx.readHalfword());
    if (localId !== 0) movingNpcId = localId;
    const id = movingNpcId;
    const { mapNum, mapGroup } = save.location;
    ctx.setupNative(() => ctx.ow.game.scriptMovement.isFinished(ctx.ow.objects.byLocalIdAndMap(id, mapNum, mapGroup)));
    return true;
  },
  waitmovementat: (ctx) => {
    const localId = varGet(ctx.readHalfword());
    if (localId !== 0) movingNpcId = localId;
    const mapGroup = ctx.readByte();
    const mapNum = ctx.readByte();
    const id = movingNpcId;
    ctx.setupNative(() => ctx.ow.game.scriptMovement.isFinished(ctx.ow.objects.byLocalIdAndMap(id, mapNum, mapGroup)));
    return true;
  },
  removeobject: (ctx) => { removeObject(ctx, varGet(ctx.readHalfword())); return false; },
  removeobjectat: (ctx) => { removeResolvedObject(ctx, readObjectAt(ctx)); return false; },
  addobject: (ctx) => { addObject(ctx, varGet(ctx.readHalfword())); return false; },
  addobjectat: (ctx) => {
    const id = varGet(ctx.readHalfword()) & 0xff;
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
    ctx.setupNative(() => {
      if (failed) throw failure;
      if (!loaded) return false;
      spawn(loaded);
      return true;
    });
    return true;
  },
  setobjectxy: (ctx) => {
    const localId = varGet(ctx.readHalfword());
    const x = varGet(ctx.readHalfword());
    const y = varGet(ctx.readHalfword());
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
    const localId = varGet(ctx.readHalfword());
    const x = varGet(ctx.readHalfword());
    const y = varGet(ctx.readHalfword());
    const t = ctx.ow.objects.templates.find((tt) => tt.localId === localId);
    if (t) { t.x = x << 16 >> 16; t.y = y << 16 >> 16; }
    return false;
  },
  copyobjectxytoperm: (ctx) => {
    const localId = varGet(ctx.readHalfword());
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
    const localId = varGet(ctx.readHalfword());
    const direction = ctx.readByte();
    const o = localIdObject(ctx, localId);
    if (o) ctx.ow.objects.turn(o, direction);
    return false;
  },
  setobjectmovementtype: (ctx) => {
    const localId = varGet(ctx.readHalfword());
    const type = ctx.readByte();
    const t = ctx.ow.objects.templates.find((tt) => tt.localId === localId);
    if (t) t.movementType = type;
    return false;
  },
  createvobject: (ctx) => {
    const gfx = ctx.readByte(); const id = ctx.readByte(); const x = varGet(ctx.readHalfword()); const y = varGet(ctx.readHalfword()); const elevation = ctx.readByte(); const dir = ctx.readByte();
    ctx.ow.game.createVirtualObject(gfx, id, x, y, elevation, dir);
    return false;
  },
  turnvobject: (ctx) => { const id = ctx.readByte(); const dir = ctx.readByte(); ctx.ow.game.turnVirtualObject(id, dir); return false; },
  lockall: (ctx) => {
    ctx.ow.objects.freezeAll();
    ctx.setupNative(() => waitPlayerStopMoving(ctx));
    return true;
  },
  lock: (ctx) => {
    const o = selected(ctx);
    if (o && o.active && !o.isPlayer) {
      ctx.ow.objects.freezeAll(o);
      let npcFrozen = false;
      if (!o.singleMovementActive) { ctx.ow.objects.freeze(o); npcFrozen = true; }
      let playerDone = false;
      ctx.setupNative(() => {
        if (!playerDone && ctx.ow.player.tileTransitionState !== T_TILE_TRANSITION) {
          handleEnforcedLookDirection(ctx);
          playerDone = true;
        }
        if (!npcFrozen && !o.singleMovementActive) { ctx.ow.objects.freeze(o); npcFrozen = true; }
        if (playerDone && npcFrozen) { stopPlayerAvatar(ctx); return true; }
        return false;
      });
    } else {
      ctx.ow.objects.freezeAll();
      ctx.setupNative(() => waitPlayerStopMoving(ctx));
    }
    return true;
  },
  releaseall: (ctx) => {
    ctx.ow.messageBox.hide();
    ctx.ow.objects.clearHeldMovementIfFinished(ctx.ow.player.object);
    ctx.ow.game.scriptMovement.unfreezeAndStop();
    ctx.ow.objects.unfreezeAll();
    return false;
  },
  release: (ctx) => {
    ctx.ow.messageBox.hide();
    const o = selected(ctx);
    if (o && o.active) ctx.ow.objects.clearHeldMovementIfFinished(o);
    ctx.ow.objects.clearHeldMovementIfFinished(ctx.ow.player.object);
    ctx.ow.game.scriptMovement.unfreezeAndStop();
    ctx.ow.objects.unfreezeAll();
    return false;
  },
  textcolor: (ctx) => { varSet(SV.PREV_TEXT_COLOR, varGet(SV.TEXT_COLOR)); varSet(SV.TEXT_COLOR, ctx.readByte()); return false; },
  message: (ctx) => { ctx.ow.messageBox.show(rom.stringAt(textPtr(ctx))); return false; },
  messageautoscroll: (ctx) => { ctx.ow.messageBox.show(rom.stringAt(textPtr(ctx)), true); return false; },
  vmessage: (ctx) => { ctx.ow.messageBox.show(rom.stringAt(ctx.readWord() - addressOffset)); return false; },
  loadhelp: (ctx) => { textPtr(ctx); return false; },
  unloadhelp: () => false,
  waitmessage: (ctx) => { ctx.setupNative(() => ctx.ow.messageBox.isHidden()); return true; },
  closemessage: (ctx) => { ctx.ow.messageBox.hide(); return false; },
  waitbuttonpress: (ctx) => { ctx.setupNative(() => JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)); return true; },
  yesnobox: (ctx) => {
    const left = ctx.readByte();
    const top = ctx.readByte();
    if (ctx.ow.game.scriptMenu.yesNo(left, top)) { ctx.ow.script.stop(); return true; }
    return false;
  },
  multichoice: (ctx) => {
    const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const ignoreB = ctx.readByte();
    if (ctx.ow.game.scriptMenu.multichoice(left, top, id, ignoreB !== 0, 0)) { ctx.ow.script.stop(); return true; }
    return false;
  },
  multichoicedefault: (ctx) => {
    const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const def = ctx.readByte(); const ignoreB = ctx.readByte();
    if (ctx.ow.game.scriptMenu.multichoice(left, top, id, ignoreB !== 0, def)) { ctx.ow.script.stop(); return true; }
    return false;
  },
  multichoicegrid: (ctx) => {
    const left = ctx.readByte(); const top = ctx.readByte(); const id = ctx.readByte(); const cols = ctx.readByte(); const ignoreB = ctx.readByte();
    if (ctx.ow.game.scriptMenu.multichoiceGrid(left, top, id, ignoreB !== 0, cols)) { ctx.ow.script.stop(); return true; }
    return false;
  },
  drawbox: () => false,
  erasebox: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.readByte(); ctx.readByte(); return false; },
  drawboxtext: () => false,
  showmonpic: (ctx) => {
    const species = varGet(ctx.readHalfword());
    const x = ctx.readByte(); const y = ctx.readByte();
    ctx.ow.game.scriptMenu.showMonPic(species, x, y);
    sound.playCry(species, 0);
    return false;
  },
  hidemonpic: (ctx) => {
    const wait = ctx.ow.game.scriptMenu.hideMonPic();
    if (!wait) return false;
    ctx.setupNative(wait);
    return true;
  },
  showcontestpainting: (ctx) => { ctx.readByte(); return false; },
  braillemessage: (ctx) => { ctx.ow.messageBox.showBraille(rom.stringAt(textPtr(ctx))); return false; },
  getbraillestringwidth: (ctx) => { varSet(SV.x8004, stringWidth(FONT_BRAILLE, rom.stringAt(textPtr(ctx)), -1)); return false; },
  bufferspeciesname: (ctx) => { const i = ctx.readByte(); stringVarSet(i, speciesName(varGet(ctx.readHalfword()))); return false; },
  bufferleadmonspeciesname: (ctx) => { const i = ctx.readByte(); const mon = save.party[leadMonIndex()]; stringVarSet(i, speciesName(mon?.species ?? 0)); return false; },
  bufferpartymonnick: (ctx) => { const i = ctx.readByte(); const idx = varGet(ctx.readHalfword()); const mon = save.party[idx]; stringVarSet(i, mon ? nickname(mon) : encode("")); return false; },
  bufferitemname: (ctx) => { const i = ctx.readByte(); stringVarSet(i, items.itemName(varGet(ctx.readHalfword()))); return false; },
  bufferitemnameplural: (ctx) => {
    const i = ctx.readByte();
    const item = varGet(ctx.readHalfword());
    const quantity = varGet(ctx.readHalfword());
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
  bufferdecorationname: (ctx) => { ctx.readByte(); ctx.readHalfword(); return false; },
  buffermovename: (ctx) => { const i = ctx.readByte(); stringVarSet(i, b64(rom.moves[varGet(ctx.readHalfword())]?.name ?? rom.moves[0].name)); return false; },
  buffernumberstring: (ctx) => { const i = ctx.readByte(); const n = varGet(ctx.readHalfword()); stringVarSet(i, intToDecimal(n, STR_CONV_MODE_LEFT_ALIGN, countDigits(n))); return false; },
  bufferstdstring: (ctx) => {
    const i = ctx.readByte();
    const index = varGet(ctx.readHalfword());
    const sym = rom.scriptMenu.stdStrings[index];
    stringVarSet(i, sym ? rom.text(sym) : encode(""));
    return false;
  },
  bufferstring: (ctx) => { const i = ctx.readByte(); stringVarSet(i, rom.stringAt(ctx.readWord())); return false; },
  vbuffermessage: (ctx) => { stringVars.var4 = rom.stringAt(ctx.readWord() - addressOffset); return false; },
  vbufferstring: (ctx) => { const i = ctx.readByte(); stringVarSet(i, rom.stringAt(ctx.readWord() - addressOffset)); return false; },
  // scrcmd.c ScrCmd_bufferboxname copies GetBoxNamePtr, including custom names.
  bufferboxname: (ctx) => {
    const i = ctx.readByte();
    const box = varGet(ctx.readHalfword());
    stringVarSet(i, getBoxName(box));
    return false;
  },
  givemon: (ctx) => {
    const species = varGet(ctx.readHalfword());
    const level = ctx.readByte();
    const item = varGet(ctx.readHalfword());
    ctx.readWord(); ctx.readWord(); ctx.readByte();
    varSet(SV.RESULT, ctx.ow.game.scriptGiveMon(species, level, item));
    return false;
  },
  giveegg: (ctx) => { const species = varGet(ctx.readHalfword()); varSet(SV.RESULT, ctx.ow.game.scriptGiveEgg(species)); return false; },
  setmonmove: (ctx) => {
    const partyIndex = ctx.readByte(); const slot = ctx.readByte(); const move = ctx.readHalfword();
    const mon = save.party[partyIndex];
    if (mon) setMoveSlot(mon, move, slot);
    return false;
  },
  checkpartymove: (ctx) => {
    const move = ctx.readHalfword();
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
  addmoney: (ctx) => { const amount = ctx.readWord(); const ignore = ctx.readByte(); if (!ignore) items.addMoney(amount); return false; },
  removemoney: (ctx) => { const amount = ctx.readWord(); const ignore = ctx.readByte(); if (!ignore) items.removeMoney(amount); return false; },
  checkmoney: (ctx) => { const amount = ctx.readWord(); const ignore = ctx.readByte(); if (!ignore) varSet(SV.RESULT, items.isEnoughMoney(amount) ? 1 : 0); return false; },
  showmoneybox: (ctx) => { const x = ctx.readByte(); const y = ctx.readByte(); const ignore = ctx.readByte(); if (!ignore) ctx.ow.game.scriptMenu.showMoneyBox(x, y); return false; },
  hidemoneybox: (ctx) => { ctx.ow.game.scriptMenu.hideMoneyBox(); return false; },
  updatemoneybox: (ctx) => { ctx.readByte(); ctx.readByte(); const ignore = ctx.readByte(); if (!ignore) ctx.ow.game.scriptMenu.updateMoneyBox(); return false; },
  showcoinsbox: (ctx) => { const x = ctx.readByte(); const y = ctx.readByte(); ctx.ow.game.scriptMenu.showCoinsBox(x, y); return false; },
  hidecoinsbox: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.ow.game.scriptMenu.hideCoinsBox(); return false; },
  updatecoinsbox: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.ow.game.scriptMenu.updateCoinsBox(); return false; },
  checkcoins: (ctx) => { varSet(ctx.readHalfword(), items.GetCoins()); return false; },
  addcoins: (ctx) => { varSet(SV.RESULT, items.addCoins(varGet(ctx.readHalfword())) ? 0 : 1); return false; },
  removecoins: (ctx) => { varSet(SV.RESULT, items.removeCoins(varGet(ctx.readHalfword())) ? 0 : 1); return false; },
  trainerbattle: (ctx) => { ctx.scriptPtr = ctx.ow.game.battleSetup.configureTrainerBattle(ctx.scriptPtr); return false; },
  dotrainerbattle: (ctx) => { ctx.ow.game.battleSetup.startTrainerBattle(); return true; },
  gotopostbattlescript: (ctx) => { ctx.scriptPtr = ctx.ow.game.battleSetup.scriptAddrAfterBattle(); return false; },
  gotobeatenscript: (ctx) => { ctx.scriptPtr = ctx.ow.game.battleSetup.trainerPostBattleScript(); return false; },
  checktrainerflag: (ctx) => { ctx.comparisonResult = ctx.ow.game.battleSetup.hasTrainerBeenFought(varGet(ctx.readHalfword())) ? 1 : 0; return false; },
  settrainerflag: (ctx) => { ctx.ow.game.battleSetup.setTrainerFlag(varGet(ctx.readHalfword())); return false; },
  cleartrainerflag: (ctx) => { ctx.ow.game.battleSetup.clearTrainerFlag(varGet(ctx.readHalfword())); return false; },
  setwildbattle: (ctx) => {
    const species = ctx.readHalfword(); const level = ctx.readByte(); const item = ctx.readHalfword();
    ctx.ow.game.battleSetup.createScriptedWildMon(species, level, item);
    return false;
  },
  dowildbattle: (ctx) => { ctx.ow.game.battleSetup.startScriptedWildBattle(); ctx.ow.script.stop(); return true; },
  pokemart: (ctx) => { const ptr = ctx.readWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.stop(); return true; },
  pokemartdecoration: (ctx) => { const ptr = ctx.readWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.stop(); return true; },
  pokemartdecoration2: (ctx) => { const ptr = ctx.readWord(); ctx.ow.game.createPokemartMenu(ptr); ctx.ow.script.stop(); return true; },
  playslotmachine: (ctx) => { const id = varGet(ctx.readHalfword()); ctx.ow.game.playSlotMachine(id); ctx.ow.script.stop(); return true; },
  setberrytree: (ctx) => { ctx.readByte(); ctx.readByte(); ctx.readByte(); return false; },
  choosecontestmon: (ctx) => { ctx.ow.script.stop(); return true; },
  startcontest: () => false,
  showcontestresults: () => false,
  contestlinktransfer: () => false,
  getpokenewsactive: (ctx) => { ctx.readHalfword(); return false; },
  fadescreen: (ctx) => {
    paletteFade.fadeScreen(ctx.readByte(), 0);
    ctx.setupNative(() => !paletteFade.active);
    return true;
  },
  fadescreenspeed: (ctx) => {
    const mode = ctx.readByte();
    const speed = ctx.readByte();
    paletteFade.fadeScreen(mode, speed);
    ctx.setupNative(() => !paletteFade.active);
    return true;
  },
  setflashlevel: (ctx) => { const level = varGet(ctx.readHalfword()); ctx.ow.flashLevel = level < 0 || level > 4 ? 0 : level; return false; },
  animateflash: (ctx) => {
    const target = ctx.readByte();
    ctx.ow.game.animateFlash(target);
    ctx.ow.script.stop();
    return true;
  },
  dofieldeffect: (ctx) => { fieldEffectScriptId = varGet(ctx.readHalfword()); ctx.ow.game.fieldEffectStart(fieldEffectScriptId); return false; },
  setfieldeffectargument: (ctx) => { const n = ctx.readByte(); ctx.ow.game.fieldEffectArguments[n] = (varGet(ctx.readHalfword()) << 16) >> 16; return false; },
  waitfieldeffect: (ctx) => {
    fieldEffectScriptId = varGet(ctx.readHalfword());
    const id = fieldEffectScriptId;
    ctx.setupNative(() => !ctx.ow.effects.active.has(id));
    return true;
  },
  setrespawn: (ctx) => { ctx.ow.setLastHealLocationWarp(varGet(ctx.readHalfword())); return false; },
  checkplayergender: () => { varSet(SV.RESULT, save.playerGender); return false; },
  playmoncry: (ctx) => { const species = varGet(ctx.readHalfword()); const mode = varGet(ctx.readHalfword()); sound.playCry(species, mode); return false; },
  waitmoncry: (ctx) => { ctx.setupNative(() => sound.isCryFinished()); return true; },
  setmetatile: (ctx) => {
    const x = varGet(ctx.readHalfword()) + MAP_OFFSET;
    const y = varGet(ctx.readHalfword()) + MAP_OFFSET;
    const metatile = varGet(ctx.readHalfword());
    const impassable = varGet(ctx.readHalfword());
    ctx.ow.map.setMetatileIdAt(x, y, impassable ? metatile | MAPGRID_COLLISION_MASK : metatile);
    return false;
  },
  resetweather: (ctx) => { ctx.ow.game.weather.setSavedFromHeader(ctx.ow.header.weather); return false; },
  setweather: (ctx) => { ctx.ow.game.weather.setWeather(varGet(ctx.readHalfword())); return false; },
  doweather: (ctx) => { ctx.ow.game.weather.doCurrent(); return false; },
  setstepcallback: (ctx) => { ctx.ow.game.setStepCallback(ctx.readByte()); return false; },
  setmaplayoutindex: (ctx) => { ctx.ow.game.setMapLayoutIndex(varGet(ctx.readHalfword())); return false; },
  opendoor: (ctx) => {
    const x = varGet(ctx.readHalfword()) + MAP_OFFSET;
    const y = varGet(ctx.readHalfword()) + MAP_OFFSET;
    sound.playSE(ctx.ow.doors.soundEffect(x, y));
    ctx.ow.doors.animateOpen(x, y);
    return false;
  },
  closedoor: (ctx) => { const x = varGet(ctx.readHalfword()) + MAP_OFFSET; const y = varGet(ctx.readHalfword()) + MAP_OFFSET; ctx.ow.doors.animateClose(x, y); return false; },
  waitdooranim: (ctx) => { ctx.setupNative(() => !ctx.ow.doors.isRunning()); return true; },
  setdooropen: (ctx) => { const x = varGet(ctx.readHalfword()) + MAP_OFFSET; const y = varGet(ctx.readHalfword()) + MAP_OFFSET; ctx.ow.doors.setOpened(x, y); return false; },
  setdoorclosed: (ctx) => { const x = varGet(ctx.readHalfword()) + MAP_OFFSET; const y = varGet(ctx.readHalfword()) + MAP_OFFSET; ctx.ow.doors.setClosed(x, y); return false; },
  addelevmenuitem: () => false,
  showelevmenu: () => false,
  setvaddress: (ctx) => { const addr1 = ctx.scriptPtr - 1; const addr2 = ctx.readWord(); addressOffset = addr2 - addr1; return false; },
  vgoto: (ctx) => { ctx.jump(ctx.readWord() - addressOffset); return false; },
  vcall: (ctx) => { ctx.call(ctx.readWord() - addressOffset); return false; },
  vgoto_if: (ctx) => { const c = ctx.readByte(); const p = ctx.readWord() - addressOffset; if (cond(ctx, c)) ctx.jump(p); return false; },
  vcall_if: (ctx) => { const c = ctx.readByte(); const p = ctx.readWord() - addressOffset; if (cond(ctx, c)) ctx.call(p); return false; },
  incrementgamestat: (ctx) => { incrementGameStat(ctx.readByte()); return false; },
  comparestat: (ctx) => {
    const stat = ctx.readByte();
    const value = ctx.readWord();
    ctx.comparisonResult = compare(save.gameStats[stat] ?? 0, value);
    return false;
  },
  signmsg: (ctx) => { ctx.ow.control.msgIsSignpost = true; return false; },
  normalmsg: (ctx) => { ctx.ow.control.msgIsSignpost = false; return false; },
  setmonmodernfatefulencounter: (ctx) => { const i = varGet(ctx.readHalfword()); if (save.party[i]) save.party[i].modernFatefulEncounter = true; return false; },
  checkmonmodernfatefulencounter: (ctx) => { const i = varGet(ctx.readHalfword()); varSet(SV.RESULT, save.party[i]?.modernFatefulEncounter ? 1 : 0); return false; },
  setworldmapflag: (ctx) => { MapPreview_SetFlag(ctx.readHalfword()); return false; },
  setmonmetlocation: (ctx) => { const i = varGet(ctx.readHalfword()); const loc = ctx.readByte(); if (save.party[i]) save.party[i].metLocation = loc; return false; },
};

function readWarpData(ctx: ScriptRunner) {
  const mapGroup = ctx.readByte();
  const mapNum = ctx.readByte();
  const warpId = ctx.readByte();
  const x = varGet(ctx.readHalfword());
  const y = varGet(ctx.readHalfword());
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

function handleEnforcedLookDirection(ctx: ScriptRunner): void {
  const p = ctx.ow.player.object;
  p.heldMovementActive = false;
  ctx.ow.objects.forceSetHeldMovement(p, [0, 0, 1, 2, 3][p.facingDirection] ?? 0);
}

function stopPlayerAvatar(ctx: ScriptRunner): void {
  const p = ctx.ow.player.object;
  p.inanimate = false;
  p.disableAnim = false;
  p.facingDirectionLocked = false;
  ctx.ow.player.flags &= ~0x80;
  ctx.ow.objects.setDirection(p, p.facingDirection);
}

function waitPlayerStopMoving(ctx: ScriptRunner): boolean {
  if (ctx.ow.player.tileTransitionState === T_TILE_TRANSITION) return false;
  handleEnforcedLookDirection(ctx);
  stopPlayerAvatar(ctx);
  return true;
}

export { LOCALID_PLAYER, copy, EOS, tasks };
