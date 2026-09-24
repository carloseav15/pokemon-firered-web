// post_battle_event_funcs.c EnterHallOfFame, hall_of_fame.c (team record,
// the per-mon display, player info, the warp to the credits scene and the
// HALL OF FAME PC viewer) and credits.c (the credits text script and THE END).

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { encode, intToDecimal, stringVars, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN } from "./gba/charmap";
import { cdata, symName } from "./hw/assets";
import { rom } from "./rom";
import { flagGet, flagSet, save, varSet } from "./save";
import { healMon, nickname, speciesName, type Pokemon } from "./pokemon/pokemon";
import { openHardwareChoice, openHardwareMessage } from "./menus/hardwareChoice";
import { fieldMenu } from "./menus/fieldMenus";
import type { Game } from "./game";

type HofMon = { species: number; level: number; personality: number; otId: number; nickname: number[] };
const HALL_OF_FAME_MAX_TEAMS = 50;
const text = (name: string): Uint8Array => Uint8Array.from(cdata<number[]>("strings", name));

function hallOfFame(): HofMon[][] {
  const s = save as unknown as { hallOfFame?: HofMon[][] };
  if (!s.hallOfFame) s.hallOfFame = [];
  return s.hallOfFame;
}

/** EnterHallOfFame (post_battle_event_funcs.c) followed by CB2_DoHallOfFameScreen. */
export function enterHallOfFame(game: Game): void {
  const ow = game.overworld;
  for (const mon of save.party) healMon(mon);
  flagSet(C.FLAG_SYS_GAME_CLEAR);
  const stats = save.gameStats;
  if (!stats[C.GAME_STAT_FIRST_HOF_PLAY_TIME]) {
    const secs = Math.floor(save.playTimeFrames / 60);
    stats[C.GAME_STAT_FIRST_HOF_PLAY_TIME] = (Math.floor(secs / 3600) << 16) | ((Math.floor(secs / 60) % 60) << 8) | (secs % 60);
  }
  // SetContinueGameWarpStatus + SetContinueGameWarpToHealLocation(HEAL_LOCATION_PALLET_TOWN)
  (save as unknown as { continueGameWarpActive?: boolean }).continueGameWarpActive = true;
  const heal = ow.healLocation(C.HEAL_LOCATION_PALLET_TOWN);
  if (heal) save.continueGameWarp = { mapGroup: heal.mapGroup, mapNum: heal.mapNum, warpId: -1, x: heal.x, y: heal.y };
  let ribbon = false;
  for (const mon of save.party) {
    if (mon.isEgg) continue;
    const m = mon as Pokemon & { ribbons?: number[] };
    m.ribbons ??= [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (!m.ribbons[5]) { m.ribbons[5] = 1; ribbon = true; }
  }
  if (ribbon) {
    stats[C.GAME_STAT_RECEIVED_RIBBONS] = (stats[C.GAME_STAT_RECEIVED_RIBBONS] ?? 0) + 1;
    flagSet(C.FLAG_SYS_RIBBON_GET);
  }
  ow.script.stop();
  // Task_Hof_InitTeamSaveData: the newest team is appended, the oldest dropped.
  const teams = hallOfFame();
  teams.push(save.party.filter((m) => !m.isEgg).map((m) => ({ species: m.species, level: m.level, personality: m.personality, otId: m.otId, nickname: [...m.nickname] })));
  while (teams.length > HALL_OF_FAME_MAX_TEAMS) teams.shift();
  stats[C.GAME_STAT_ENTERED_HOF] = (stats[C.GAME_STAT_ENTERED_HOF] ?? 0) + 1;
  game.writeSave();
  sound.playSE(C.SE_SAVE);
  sound.playNewMapMusic(C.MUS_HALL_OF_FAME);
  fieldMenu(game, (close) => {
    const team = teams[teams.length - 1];
    const showMon = (i: number): void => {
      if (i >= team.length) { welcome(); return; }
      const mon = team[i];
      sound.playCry(mon.species, 0);
      openHardwareMessage(monInfo(mon), () => showMon(i + 1));
    };
    const welcome = (): void => {
      openHardwareMessage(text("gText_WelcomeToHOF"), () => {
        stringVars.player = Uint8Array.from(save.playerName);
        openHardwareMessage(playerInfo(), () => {
          sound.fadeOutBGM(4);
          close();
          // SetWarpsToRollCredits
          varSet(C.VAR_MAP_SCENE_INDIGO_PLATEAU_EXTERIOR, 1);
          flagSet(C.FLAG_DONT_SHOW_MAP_NAME_POPUP);
          const num = rom.c("MAP_INDIGO_PLATEAU_EXTERIOR");
          ow.setWarpDestination(num >> 8, num & 0xff, -1, 11, 6);
          ow.keepMusicOnNextLoad = true;
          ow.doWarp();
          ow.resetInitialPlayerAvatarState();
        });
      });
    };
    showMon(0);
  }, false);
}

/** HallOfFame_PrintMonInfo: No., species/nickname, level. */
function monInfo(mon: HofMon): Uint8Array {
  const dex = rom.species[mon.species]?.national ?? 0;
  const bytes: number[] = [];
  const add = (b: ArrayLike<number>) => { for (const c of Array.from(b)) { if (c === 0xff) break; bytes.push(c); } };
  add(text("gText_Number"));
  add(intToDecimal(dex, STR_CONV_MODE_LEADING_ZEROS, 3));
  bytes.push(0x00);
  add(Uint8Array.from(mon.nickname));
  bytes.push(0xfe);
  add(speciesName(mon.species));
  bytes.push(0x00);
  add(text("gText_Level"));
  add(intToDecimal(mon.level, STR_CONV_MODE_LEFT_ALIGN, 3));
  bytes.push(0xff);
  return Uint8Array.from(bytes);
}

/** HallOfFame_PrintPlayerInfo: name, ID No., play time. */
function playerInfo(): Uint8Array {
  const bytes: number[] = [];
  const add = (b: ArrayLike<number>) => { for (const c of Array.from(b)) { if (c === 0xff) break; bytes.push(c); } };
  add(text("gText_Name"));
  bytes.push(0x00);
  add(Uint8Array.from(save.playerName));
  bytes.push(0xfe);
  add(text("gText_IDNumber"));
  add(intToDecimal(save.trainerId & 0xffff, STR_CONV_MODE_LEADING_ZEROS, 5));
  bytes.push(0xfb);
  add(text("gText_Time"));
  const secs = Math.floor(save.playTimeFrames / 60);
  add(encode(` ${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, "0")}`));
  bytes.push(0xff);
  return Uint8Array.from(bytes);
}

/** HallOfFamePCBeginFade → CB2_InitHofPC: browse the saved teams, then the PC menu reopens. */
export function openHallOfFamePc(game: Game): void {
  const ow = game.overworld;
  ow.script.stop();
  fieldMenu(game, (close) => {
    const teams = hallOfFame();
    const done = (): void => { close(); game.scriptMenu.pcMenu(); };
    if (!teams.length) { done(); return; }
    const list = (): void => openHardwareChoice(text("gText_HallOfFame"), teams.map((_, i) => ({
      label: `No. ${teams.length - i}`, value: teams.length - 1 - i,
    })), true, (index) => {
      if (index === null) { done(); return; }
      const team = teams[index];
      stringVars.var1 = intToDecimal(index + 1, STR_CONV_MODE_LEFT_ALIGN, 3);
      const show = (i: number): void => {
        if (i >= team.length) { list(); return; }
        sound.playCry(team[i].species, 0);
        openHardwareMessage(monInfo(team[i]), () => show(i + 1));
      };
      show(0);
    });
    list();
  }, false);
}

type CreditsCmd = { cmd: number; param: number; duration?: number };
type CreditsText = { title: unknown; names: unknown };

/** DoCredits (credits.c RollCredits): the staff pages, THE END, then SoftReset. */
export function doCredits(game: Game): void {
  const ow = game.overworld;
  ow.script.stop();
  sound.playNewMapMusic(C.MUS_CREDITS);
  fieldMenu(game, () => {
    const script = cdata<CreditsCmd[]>("credits", "sCreditsScript");
    const texts = cdata<CreditsText[]>("credits", "sCreditsTexts");
    const run = (i: number): void => {
      if (i >= script.length) { theEnd(); return; }
      const c = script[i];
      if (c.cmd !== 0) { run(i + 1); return; }
      const t = texts[c.param];
      const title = symName(t.title), names = symName(t.names);
      const bytes = [...(title ? text(title) : [])].filter((b) => b !== 0xff);
      bytes.push(...[...(names ? text(names) : [])].filter((b) => b !== 0xff), 0xff);
      openHardwareMessage(Uint8Array.from(bytes), () => run(i + 1));
    };
    const theEnd = (): void => {
      openHardwareMessage(encode("THE END"), () => {
        // SoftReset(RESET_ALL): back to the title screen.
        window.location.reload();
      });
    };
    run(0);
  }, false);
}

void flagGet; void nickname;
