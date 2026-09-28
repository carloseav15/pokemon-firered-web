// field_player_avatar.c StartFishing / Task_Fishing (sFishingStateFuncs) and
// AlignFishingAnimationFrames: the dot game, bite window and encounter.

import { encode } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { joy, A_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { printText, TextPrinter, getTextSpeedSetting } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { random } from "../random";
import { rom } from "../rom";
import { GetFishingBiteDirectionAnimNum, GetFishingDirectionAnimNum, GetFishingNoCatchDirectionAnimNum } from "../generated/eventObjectAnims";
import { DIR_WEST } from "./objectEvents";
import type { Overworld } from "./overworld";
import { PLAYER_AVATAR_GFX_FISH } from "./playerAvatar";

const START_ROUND = 3, GOT_BITE = 6, ON_HOOK = 9, NO_BITE = 11, GOT_AWAY = 12, SHOW_RESULT = 13;

export function startFishing(ow: Overworld, rod: number): void {
  const player = ow.player.object;
  const sprite = player.sprite;
  let step = 0, frameCounter = 0, roundsPlayed = 0, minRoundsRequired = 0, playerGfxId = 0, numDots = 0, dotsRequired = 0;
  let window: Window | undefined;
  let printer: TextPrinter | undefined;

  const align = (): void => {
    // AlignFishingAnimationFrames: the player sprite is animated here, then offset by the frame shown.
    sprite.animate();
    sprite.x2 = 0;
    sprite.y2 = 0;
    const frame = sprite.imageValue;
    if (frame === 1 || frame === 2 || frame === 3) sprite.x2 = player.facingDirection === DIR_WEST ? -8 : 8;
    if (frame === 5) sprite.y2 = -8;
    if (frame === 10 || frame === 11) sprite.y2 = 8;
    if (ow.player.isSurfing()) ow.effects.setSurfBlobPlayerOffset(true, sprite.y2);
  };
  const openWindow = (): Window => {
    if (!window) {
      window = new Window(2, 15, 26, 4);
      window.frame = "dialogue";
      window.fill(1);
      window.visible = true;
      ow.windows.add(window);
    }
    return window;
  };
  const closeWindow = (): void => {
    if (window) ow.windows.remove(window);
    window = undefined;
    printer = undefined;
  };
  const print = (symbol: string): void => {
    const w = openWindow();
    w.fill(1);
    printer = new TextPrinter(w, FONT_NORMAL, rom.text(symbol), { x: 0, y: 1, speed: getTextSpeedSetting(), fg: 2, bg: 1, shadow: 3 });
  };
  const restorePlayer = (): void => {
    ow.objects.setGraphicsId(player, playerGfxId);
    ow.syncObjectSprites();
    ow.objects.turn(player, player.movementDirection);
    if (ow.player.isSurfing()) ow.effects.setSurfBlobPlayerOffset(false, 0);
    sprite.x2 = 0;
    sprite.y2 = 0;
  };

  // sFishingStateFuncs (field_player_avatar.c): Task_Fishing steps through these by
  // tStep (the local `step` here) until one returns FALSE for the frame.
  function Fishing1(): boolean { ow.controlsLocked = true; ow.player.preventStep = true; step++; return false; }
  function Fishing2(): boolean {
    roundsPlayed = 0;
    minRoundsRequired = [1, 1, 1][rod] + (random() % [1, 3, 6][rod]);
    playerGfxId = player.graphicsId;
    ow.objects.clearHeldMovementIfActive(player);
    player.enableAnim = true;
    ow.player.setState(PLAYER_AVATAR_GFX_FISH);
    sprite.startAnim(GetFishingDirectionAnimNum(player.facingDirection));
    step++;
    return false;
  }
  function Fishing3(): boolean { align(); if (++frameCounter >= 60) step++; return false; }
  function Fishing4(): boolean {
    openWindow().fill(1);
    step++;
    frameCounter = 0;
    numDots = 0;
    const r = random() % 10;
    dotsRequired = roundsPlayed === 0 ? r + 4 : r + 1;
    if (dotsRequired >= 10) dotsRequired = 10;
    return true;
  }
  function Fishing5(): boolean {
    align();
    if (++frameCounter >= 20) {
      frameCounter = 0;
      if (numDots >= dotsRequired) {
        step++;
        if (roundsPlayed !== 0) step++;
        roundsPlayed++;
      } else {
        printText(openWindow(), FONT_NORMAL, encode("·"), numDots * 12, 1, { fg: 2, bg: 1, shadow: 3 });
        numDots++;
      }
    }
    return false;
  }
  function Fishing6(): boolean {
    align();
    step++;
    if (!ow.game.wild.hasFishingMons() || random() & 1) step = NO_BITE;
    else sprite.startAnim(GetFishingBiteDirectionAnimNum(player.facingDirection));
    return true;
  }
  function Fishing7(): boolean { step += 3; return false; }
  /** Waits for A or the reel timeout. */
  function Fishing8(): boolean {
    align();
    if (++frameCounter >= [36, 33, 30][rod]) step = GOT_AWAY;
    else if (joy.newKeys & A_BUTTON) step++;
    return false;
  }
  /** Maybe plays another round. */
  function Fishing9(): boolean {
    align();
    step++;
    if (roundsPlayed < minRoundsRequired) step = START_ROUND;
    else if (roundsPlayed < 2) {
      const probability = random() % 100;
      if ([[0, 0], [40, 10], [70, 30]][rod][roundsPlayed] > probability) step = START_ROUND;
    }
    return false;
  }
  function Fishing10(): boolean { align(); print("gText_PokemonOnHook"); step++; frameCounter = 0; return false; }
  function Fishing11(): boolean { return onHook(); }
  function Fishing12(): boolean { align(); sprite.startAnim(GetFishingNoCatchDirectionAnimNum(player.facingDirection)); print("gText_NotEvenANibble"); step = SHOW_RESULT; return true; }
  function Fishing13(): boolean { align(); sprite.startAnim(GetFishingNoCatchDirectionAnimNum(player.facingDirection)); print("gText_ItGotAway"); step++; return true; }
  function Fishing14(): boolean { align(); step++; return false; }
  function Fishing15(): boolean {
    align();
    printer?.run();
    if (sprite.animEnded) { restorePlayer(); step++; }
    return false;
  }
  function Fishing16(): boolean {
    printer?.run();
    if (!printer?.active) {
      ow.player.preventStep = false;
      ow.controlsLocked = false;
      ow.objects.unfreezeAll();
      closeWindow();
      tasks.destroy(id);
    }
    return false;
  }
  const states: Array<() => boolean> = [
    Fishing1, Fishing2, Fishing3, Fishing4, Fishing5, Fishing6, Fishing7, Fishing8,
    Fishing9, Fishing10, Fishing11, Fishing12, Fishing13, Fishing14, Fishing15, Fishing16,
  ];
  function onHook(): boolean {
    if (frameCounter === 0) align();
    printer?.run();
    if (frameCounter === 0) {
      if (!printer?.active) {
        restorePlayer();
        closeWindow();
        frameCounter++;
      }
      return false;
    }
    ow.player.preventStep = false;
    ow.controlsLocked = false;
    tasks.destroy(id);
    ow.game.wild.fishingEncounter(rod);
    return false;
  }
  void GOT_BITE; void ON_HOOK;
  const run = (): void => {
    for (;;) {
      const fn = states[step];
      if (!fn || !fn()) break;
    }
  };
  const id = tasks.create(run, 0xff);
  run();
}
