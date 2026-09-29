// Core context and availability state from help_system.c.

import * as C from "./generated/constants";
import { gQuestLogState } from "./questLogEvents";
import { flagGet, flagSet, save } from "./save";
import { IsCurMapPokeCenter } from "./pokemon/saveLocation";
import { rom } from "./rom";
import { cdata } from "./hw/assets";
import { sound } from "./audio/sound";
import { A_BUTTON, B_BUTTON, joy, L_BUTTON, R_BUTTON } from "./gba/input";
import { GetKantoPokedexCount } from "./pokemon/pokemon";
import { checkBagHasItem } from "./pokemon/items";
import { getReceivedRemoteLinkPlayers } from "./linkState";
import {
  HelpSystem_FillPanel1, HelpSystem_FillPanel2, HelpSystem_GetMenuInput,
  HelpSystem_InitListMenuController, HelpSystem_PrintQuestionAndAnswerPair, HelpSystem_PrintTextAt,
  HelpSystem_PrintTextRightAlign_Row52, HelpSystem_PrintTopicMouseoverDescription, HelpSystem_SetInputDelay,
  HS_SetMainWindowBgBrightness, HS_ShowOrHideControlsGuideInTopRight, HS_ShowOrHideHeaderAndFooterLines_Darker,
  HS_ShowOrHideHeaderAndFooterLines_Lighter, HS_ShowOrHideHeaderLine_Darker_FooterStyle, HS_ShowOrHideMainWindowText,
  HS_ShowOrHideScrollArrows, HS_ShowOrHideToplevelTooltipWindow, HS_UpdateMenuScrollArrows,
  type HelpListMenuItem, type HelpSystemListMenu,
} from "./helpSystemUtil";

let contextId = C.HELPCONTEXT_NONE;
let enabled = false;
let toggleWithRButtonDisabled = false;
let contextBackup = C.HELPCONTEXT_NONE;

export function GetHelpContext(): number { return contextId; }

/** SetHelpContextDontCheckBattle. */
export function SetHelpContextDontCheckBattle(id: number): void { contextId = id & 0xff; }

/** SetHelpContext: keep field-help contexts while opening the bag or party during battle. */
export function SetHelpContext(id: number): void {
  const inBattle = contextId === C.HELPCONTEXT_WILD_BATTLE
    || contextId === C.HELPCONTEXT_TRAINER_BATTLE_SINGLE
    || contextId === C.HELPCONTEXT_TRAINER_BATTLE_DOUBLE
    || contextId === C.HELPCONTEXT_SAFARI_BATTLE;
  const battleMenuContext = id === C.HELPCONTEXT_BAG || id === C.HELPCONTEXT_PARTY_MENU
    || id === C.HELPCONTEXT_POKEMON_INFO || id === C.HELPCONTEXT_POKEMON_SKILLS
    || id === C.HELPCONTEXT_POKEMON_MOVES;
  if (!inBattle || !battleMenuContext) contextId = id & 0xff;
}

/** Script_SetHelpContext, called through the script-special dispatcher. */
export function Script_SetHelpContext(id: number): void { contextId = id & 0xff; }
export function BackupHelpContext(): void { contextBackup = contextId; }
export function RestoreHelpContext(): void { contextId = contextBackup; }

/** HelpSystem_Disable / HelpSystem_Enable. */
export function HelpSystem_Disable(): void { enabled = false; }
export function HelpSystem_Enable(): void {
  if (gQuestLogState !== C.QL_STATE_PLAYBACK && gQuestLogState !== C.QL_STATE_PLAYBACK_LAST) {
    enabled = true;
    HelpSystem_EnableToggleWithRButton();
  }
}
export function IsHelpSystemEnabled(): boolean { return enabled; }
export function HelpSystem_DisableToggleWithRButton(): void { toggleWithRButtonDisabled = true; }
export function HelpSystem_EnableToggleWithRButton(): void { toggleWithRButtonDisabled = false; }
export function IsHelpSystemToggleWithRButtonDisabled(): boolean { return toggleWithRButtonDisabled; }

const MART_MAPS = [
  "MAP_VIRIDIAN_CITY_MART", "MAP_PEWTER_CITY_MART", "MAP_CERULEAN_CITY_MART", "MAP_LAVENDER_TOWN_MART",
  "MAP_VERMILION_CITY_MART", "MAP_CELADON_CITY_DEPARTMENT_STORE_1F", "MAP_CELADON_CITY_DEPARTMENT_STORE_2F",
  "MAP_CELADON_CITY_DEPARTMENT_STORE_3F", "MAP_CELADON_CITY_DEPARTMENT_STORE_4F", "MAP_CELADON_CITY_DEPARTMENT_STORE_5F",
  "MAP_CELADON_CITY_DEPARTMENT_STORE_ROOF", "MAP_CELADON_CITY_DEPARTMENT_STORE_ELEVATOR", "MAP_FUCHSIA_CITY_MART",
  "MAP_CINNABAR_ISLAND_MART", "MAP_SAFFRON_CITY_MART", "MAP_THREE_ISLAND_MART", "MAP_FOUR_ISLAND_MART",
  "MAP_SEVEN_ISLAND_MART", "MAP_SIX_ISLAND_MART",
];
const GYM_MAPS = [
  "MAP_PEWTER_CITY_GYM", "MAP_CERULEAN_CITY_GYM", "MAP_VERMILION_CITY_GYM", "MAP_CELADON_CITY_GYM",
  "MAP_FUCHSIA_CITY_GYM", "MAP_SAFFRON_CITY_GYM", "MAP_CINNABAR_ISLAND_GYM", "MAP_VIRIDIAN_CITY_GYM",
];
const DUNGEON_MAP_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["MAP_VIRIDIAN_FOREST", 1], ["MAP_MT_MOON_1F", 3], ["MAP_ROCK_TUNNEL_1F", 2],
  ["MAP_DIGLETTS_CAVE_NORTH_ENTRANCE", 3], ["MAP_SEAFOAM_ISLANDS_1F", 5], ["MAP_VICTORY_ROAD_1F", 3],
  ["MAP_CERULEAN_CAVE_1F", 3], ["MAP_MT_EMBER_RUBY_PATH_B4F", 1], ["MAP_MT_EMBER_SUMMIT_PATH_1F", 3],
  ["MAP_MT_EMBER_RUBY_PATH_B5F", 7], ["MAP_THREE_ISLAND_BERRY_FOREST", 1], ["MAP_SIX_ISLAND_PATTERN_BUSH", 1],
  ["MAP_FIVE_ISLAND_LOST_CAVE_ENTRANCE", 15], ["MAP_FOUR_ISLAND_ICEFALL_CAVE_ENTRANCE", 4],
  ["MAP_SIX_ISLAND_ALTERING_CAVE", 1], ["MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER", 7],
];

/** IsCurrentMapInArray (help_system.c), over source map ids. */
function IsCurrentMapInArray(maps: readonly string[]): boolean {
  const current = (save.location.mapGroup << 8) | save.location.mapNum;
  return maps.some((name) => rom.c(name) === current);
}

/** IsInMartMap (help_system.c). */
function IsInMartMap(): boolean {
  return IsCurrentMapInArray(MART_MAPS);
}

/** IsInGymMap (help_system.c). */
function IsInGymMap(): boolean {
  return IsCurrentMapInArray(GYM_MAPS);
}

/** IsInDungeonMap (help_system.c). */
function IsInDungeonMap(): boolean {
  return DUNGEON_MAP_RANGES.some(([name, count], index) => {
    const start = rom.c(name);
    return (index !== 15 || flagGet(C.FLAG_SYS_UNLOCKED_TANOBY_RUINS))
      && (start >>> 8) === save.location.mapGroup
      && save.location.mapNum >= (start & 0xff)
      && save.location.mapNum < (start & 0xff) + count;
  });
}

/** SetHelpContextForMap (help_system.c), using the active map header and source map lists. */
export function SetHelpContextForMap(ow: { player: { isSurfing(): boolean }; header: { mapType: number } }): void {
  HelpSystem_EnableToggleWithRButton();
  if (ow.player.isSurfing()) SetHelpContext(C.HELPCONTEXT_SURFING);
  else if (IsInDungeonMap()) SetHelpContext(C.HELPCONTEXT_DUNGEON);
  else if (ow.header.mapType === C.MAP_TYPE_INDOOR || ow.header.mapType === C.MAP_TYPE_SECRET_BASE) {
    const home1 = rom.c("MAP_PALLET_TOWN_PLAYERS_HOUSE_1F");
    const home2 = rom.c("MAP_PALLET_TOWN_PLAYERS_HOUSE_2F");
    const oakLab = rom.c("MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB");
    const current = (save.location.mapGroup << 8) | save.location.mapNum;
    if (current === home1 || current === home2) SetHelpContext(C.HELPCONTEXT_PLAYERS_HOUSE);
    else if (current === oakLab) SetHelpContext(C.HELPCONTEXT_OAKS_LAB);
    else if (IsCurMapPokeCenter()) SetHelpContext(C.HELPCONTEXT_POKECENTER);
    else if (IsInMartMap()) SetHelpContext(C.HELPCONTEXT_MART);
    else if (IsInGymMap()) SetHelpContext(C.HELPCONTEXT_GYM);
    else SetHelpContext(C.HELPCONTEXT_INDOORS);
  } else SetHelpContext(C.HELPCONTEXT_OVERWORLD);
}

// ---------------------------------------------------------------- help_system.c menus

const HELP_END = 0xff;
const TOPIC_WHAT_TO_DO = 0;
const TOPIC_HOW_TO_DO = 1;
const TOPIC_TERMS = 2;
const TOPIC_ABOUT_GAME = 3;
const TOPIC_TYPE_MATCHUP = 4;
const TOPIC_EXIT = 5;
const TOPIC_COUNT = 6;

type SymPtr = { $sym: string } | 0 | null;

/** struct HelpSystemState: level 0 top, 1 submenu, 2 help content. */
export const gHelpSystemState = { level: 0, topic: 0, scrollMain: 0, scrollSub: 0 };
let sSeenHelpSystemIntro = false;

function hs<T>(name: string): T {
  return cdata<T>("help_system", name);
}

/** A `const u8 *` table entry as game text (0xFF-terminated). */
function helpText(ref: SymPtr | undefined): Uint8Array {
  if (!ref) return Uint8Array.of(0xff);
  return rom.text(ref.$sym);
}

function ptrTable(name: string, index: number): Uint8Array {
  return helpText(hs<SymPtr[]>(name)[index]);
}

function sTerms_Basic(): number[] {
  return hs<number[]>("sTerms_Basic");
}

// enum values from help_system.c (submenu IDs per topic; values repeat across topics).
const HELP_WHAT: Record<string, number> = {
  HELP_PLAYING_FOR_FIRST_TIME: 1,
  HELP_WHAT_SHOULD_I_BE_DOING: 2,
  HELP_CANT_GET_OUT_OF_ROOM: 3,
  HELP_CANT_FIND_PERSON_I_WANT: 4,
  HELP_TALKED_TO_EVERYONE_NOW_WHAT: 5,
  HELP_SOMEONE_BLOCKING_MY_WAY: 6,
  HELP_I_CANT_GO_ON: 7,
  HELP_OUT_OF_THINGS_TO_DO: 8,
  HELP_WHAT_HAPPENED_TO_ITEM_I_GOT: 9,
  HELP_WHAT_ARE_MY_ADVENTURE_BASICS: 10,
  HELP_HOW_ARE_ROADS_FORESTS_DIFFERENT: 11,
  HELP_HOW_ARE_CAVES_DIFFERENT: 12,
  HELP_HOW_DO_I_PROGRESS: 13,
  HELP_WHEN_CAN_I_USE_ITEM: 14,
  HELP_WHATS_A_BATTLE: 15,
  HELP_HOW_DO_I_PREPARE_FOR_BATTLE: 16,
  HELP_WHAT_IS_A_MONS_VITALITY: 17,
  HELP_MY_MONS_ARE_HURT: 18,
  HELP_WHAT_IS_STATUS_PROBLEM: 19,
  HELP_WHAT_HAPPENS_IF_ALL_MY_MONS_FAINT: 20,
  HELP_CANT_CATCH_MONS: 21,
  HELP_RAN_OUT_OF_POTIONS: 22,
  HELP_CAN_I_BUY_POKEBALLS: 23,
  HELP_WHATS_A_TRAINER: 24,
  HELP_HOW_DO_I_WIN_AGAINST_TRAINER: 25,
  HELP_WHERE_DO_MONS_APPEAR: 26,
  HELP_WHAT_ARE_MOVES: 27,
  HELP_WHAT_ARE_HIDDEN_MOVES: 28,
  HELP_WHAT_MOVES_SHOULD_I_USE: 29,
  HELP_WANT_TO_ADD_MORE_MOVES: 30,
  HELP_WANT_TO_MAKE_MON_STRONGER: 31,
  HELP_FOE_MONS_TOO_STRONG: 32,
  HELP_WHAT_DO_I_DO_IN_CAVE: 33,
  HELP_NOTHING_I_WANT_TO_KNOW: 34,
  HELP_WHATS_POKEMON_CENTER: 35,
  HELP_WHATS_POKEMON_MART: 36,
  HELP_WANT_TO_END_GAME: 37,
  HELP_WHATS_A_MON: 38,
  HELP_WHAT_IS_THAT_PERSON_LIKE: 39,
  HELP_WHAT_DOES_HIDDEN_MOVE_DO: 40,
  HELP_WHAT_DO_I_DO_IN_SAFARI: 41,
  HELP_WHAT_ARE_SAFARI_RULES: 42,
  HELP_WANT_TO_END_SAFARI: 43,
  HELP_WHAT_IS_A_GYM: 44,
};
const HELP_HOW: Record<string, number> = {
  HELP_USING_POKEDEX: 1,
  HELP_USING_POKEMON: 2,
  HELP_USING_SUMMARY: 3,
  HELP_USING_SWITCH: 4,
  HELP_USING_ITEM: 5,
  HELP_USING_BAG: 6,
  HELP_USING_AN_ITEM: 7,
  HELP_USING_KEYITEM: 8,
  HELP_USING_POKEBALL: 9,
  HELP_USING_PLAYER: 10,
  HELP_USING_SAVE: 11,
  HELP_USING_OPTION: 12,
  HELP_USING_POTION: 13,
  HELP_USING_TOWN_MAP: 14,
  HELP_USING_TM: 15,
  HELP_USING_HM: 16,
  HELP_USING_MOVE_OUTSIDE_OF_BATTLE: 17,
  HELP_RIDING_BICYCLE: 18,
  HELP_ENTERING_NAME: 19,
  HELP_USING_PC: 20,
  HELP_USING_BILLS_PC: 21,
  HELP_USING_WITHDRAW: 22,
  HELP_USING_DEPOSIT: 23,
  HELP_USING_MOVE: 24,
  HELP_MOVING_ITEMS: 25,
  HELP_USING_PLAYERS_PC: 26,
  HELP_USING_WITHDRAW_ITEM: 27,
  HELP_USING_DEPOSIT_ITEM: 28,
  HELP_USING_MAILBOX: 29,
  HELP_USING_PROF_OAKS_PC: 30,
  HELP_OPENING_MENU: 31,
  HELP_USING_FIGHT: 32,
  HELP_USING_POKEMON2: 33,
  HELP_USING_SHIFT: 34,
  HELP_USING_SUMMARY2: 35,
  HELP_USING_BAG2: 36,
  HELP_READING_POKEDEX: 37,
  HELP_USING_HOME_PC: 38,
  HELP_USING_ITEM_STORAGE: 39,
  HELP_USING_WITHDRAW_ITEM2: 40,
  HELP_USING_DEPOSIT_ITEM2: 41,
  HELP_USING_MAILBOX2: 42,
  HELP_USING_RUN: 43,
  HELP_REGISTER_KEY_ITEM: 44,
  HELP_USING_BALL: 45,
  HELP_USING_BAIT: 46,
  HELP_USING_ROCK: 47,
  HELP_USING_HALL_OF_FAME: 48,
};
const HELP_TERM: Record<string, number> = {
  HELP_TERM_HP: 1,
  HELP_TERM_EXP: 2,
  HELP_TERM_MOVES: 3,
  HELP_TERM_ATTACK: 4,
  HELP_TERM_DEFENSE: 5,
  HELP_TERM_SPATK: 6,
  HELP_TERM_SPDEF: 7,
  HELP_TERM_SPEED: 8,
  HELP_TERM_LEVEL: 9,
  HELP_TERM_TYPE: 10,
  HELP_TERM_OT: 11,
  HELP_TERM_ITEM: 12,
  HELP_TERM_ABILITY: 13,
  HELP_TERM_MONEY: 14,
  HELP_TERM_MOVE_TYPE: 15,
  HELP_TERM_NATURE: 16,
  HELP_TERM_ID_NO: 17,
  HELP_TERM_PP: 18,
  HELP_TERM_POWER: 19,
  HELP_TERM_ACCURACY: 20,
  HELP_TERM_FNT: 21,
  HELP_TERM_ITEMS: 22,
  HELP_TERM_KEYITEMS: 23,
  HELP_TERM_POKEBALLS: 24,
  HELP_TERM_POKEDEX: 25,
  HELP_TERM_PLAY_TIME: 26,
  HELP_TERM_BADGES: 27,
  HELP_TERM_TEXT_SPEED: 28,
  HELP_TERM_BATTLE_SCENE: 29,
  HELP_TERM_BATTLE_STYLE: 30,
  HELP_TERM_SOUND: 31,
  HELP_TERM_BUTTON_MODE: 32,
  HELP_TERM_FRAME: 33,
  HELP_TERM_CANCEL: 34,
  HELP_TERM_TM: 35,
  HELP_TERM_HM: 36,
  HELP_TERM_HM_MOVE: 37,
  HELP_TERM_EVOLUTION: 38,
  HELP_TERM_STATUS_PROBLEM: 39,
  HELP_TERM_POKEMON: 40,
  HELP_TERM_ID_NO2: 41,
  HELP_TERM_MONEY2: 42,
  HELP_TERM_BADGES2: 43,
};
const HELP_GENERAL: Record<string, number> = {
  HELP_THE_HELP_SYSTEM: 1,
  HELP_THE_GAME: 2,
  HELP_WIRELESS_ADAPTER: 3,
  HELP_GAME_FUNDAMENTALS_1: 4,
  HELP_GAME_FUNDAMENTALS_2: 5,
  HELP_GAME_FUNDAMENTALS_3: 6,
  HELP_WHAT_ARE_POKEMON: 7,
};

function IsHelpSystemSubmenuEnabled(id: number): boolean
{
    let i = 0; // eslint-disable-line prefer-const

    if (gHelpSystemState.topic === TOPIC_WHAT_TO_DO)
    {
        switch (id)
        {
        case HELP_WHAT.HELP_PLAYING_FOR_FIRST_TIME:
        case HELP_WHAT.HELP_WHAT_SHOULD_I_BE_DOING:
        case HELP_WHAT.HELP_CANT_GET_OUT_OF_ROOM:
        case HELP_WHAT.HELP_TALKED_TO_EVERYONE_NOW_WHAT:
        case HELP_WHAT.HELP_OUT_OF_THINGS_TO_DO:
        case HELP_WHAT.HELP_NOTHING_I_WANT_TO_KNOW:
        case HELP_WHAT.HELP_WHATS_A_MON:
        case HELP_WHAT.HELP_WHAT_DO_I_DO_IN_SAFARI:
        case HELP_WHAT.HELP_WHAT_ARE_SAFARI_RULES:
        case HELP_WHAT.HELP_WANT_TO_END_SAFARI:
            return true;
        case HELP_WHAT.HELP_CANT_FIND_PERSON_I_WANT:
            return flagGet(C.FLAG_VISITED_OAKS_LAB);
        case HELP_WHAT.HELP_SOMEONE_BLOCKING_MY_WAY:
        case HELP_WHAT.HELP_WHAT_ARE_MY_ADVENTURE_BASICS:
        case HELP_WHAT.HELP_HOW_DO_I_PREPARE_FOR_BATTLE:
        case HELP_WHAT.HELP_WHAT_IS_STATUS_PROBLEM:
        case HELP_WHAT.HELP_RAN_OUT_OF_POTIONS:
        case HELP_WHAT.HELP_WHATS_POKEMON_CENTER:
        case HELP_WHAT.HELP_WHATS_POKEMON_MART:
            return flagGet(C.FLAG_WORLD_MAP_VIRIDIAN_CITY);
        case HELP_WHAT.HELP_I_CANT_GO_ON:
            return flagGet(C.FLAG_WORLD_MAP_VERMILION_CITY);
        case HELP_WHAT.HELP_HOW_ARE_ROADS_FORESTS_DIFFERENT:
        case HELP_WHAT.HELP_WHATS_A_TRAINER:
            return flagGet(C.FLAG_WORLD_MAP_VIRIDIAN_FOREST);
        case HELP_WHAT.HELP_WHAT_HAPPENED_TO_ITEM_I_GOT:
        case HELP_WHAT.HELP_WHEN_CAN_I_USE_ITEM:
        case HELP_WHAT.HELP_HOW_DO_I_PROGRESS:
        case HELP_WHAT.HELP_WHATS_A_BATTLE:
        case HELP_WHAT.HELP_WHAT_IS_A_MONS_VITALITY:
        case HELP_WHAT.HELP_MY_MONS_ARE_HURT:
        case HELP_WHAT.HELP_WHAT_HAPPENS_IF_ALL_MY_MONS_FAINT:
        case HELP_WHAT.HELP_WHERE_DO_MONS_APPEAR:
        case HELP_WHAT.HELP_WHAT_MOVES_SHOULD_I_USE:
        case HELP_WHAT.HELP_WANT_TO_MAKE_MON_STRONGER:
        case HELP_WHAT.HELP_WANT_TO_END_GAME:
            return flagGet(C.FLAG_SYS_POKEMON_GET);
        case HELP_WHAT.HELP_CANT_CATCH_MONS:
        case HELP_WHAT.HELP_CAN_I_BUY_POKEBALLS:
            return flagGet(C.FLAG_SYS_POKEDEX_GET);
        case HELP_WHAT.HELP_HOW_ARE_CAVES_DIFFERENT:
        case HELP_WHAT.HELP_WHAT_DO_I_DO_IN_CAVE:
        case HELP_WHAT.HELP_HOW_DO_I_WIN_AGAINST_TRAINER:
        case HELP_WHAT.HELP_FOE_MONS_TOO_STRONG:
        case HELP_WHAT.HELP_WHAT_ARE_MOVES:
        case HELP_WHAT.HELP_WANT_TO_ADD_MORE_MOVES:
            return flagGet(C.FLAG_BADGE01_GET);
        case HELP_WHAT.HELP_WHAT_ARE_HIDDEN_MOVES:
        case HELP_WHAT.HELP_WHAT_DOES_HIDDEN_MOVE_DO:
            return HasGottenAtLeastOneHM();
        case HELP_WHAT.HELP_WHAT_IS_THAT_PERSON_LIKE:
            return flagGet(C.FLAG_GOT_FAME_CHECKER);
        case HELP_WHAT.HELP_WHAT_IS_A_GYM:
            return flagGet(C.FLAG_WORLD_MAP_PEWTER_CITY);
        }
        return false;
    }
    if (gHelpSystemState.topic === TOPIC_HOW_TO_DO)
    {
        switch (id)
        {
        case HELP_HOW.HELP_USING_BAG:
        case HELP_HOW.HELP_USING_PLAYER:
        case HELP_HOW.HELP_USING_SAVE:
        case HELP_HOW.HELP_USING_OPTION:
        case HELP_HOW.HELP_ENTERING_NAME:
        case HELP_HOW.HELP_USING_PC:
        case HELP_HOW.HELP_USING_BILLS_PC:
        case HELP_HOW.HELP_USING_WITHDRAW:
        case HELP_HOW.HELP_USING_DEPOSIT:
        case HELP_HOW.HELP_USING_MOVE:
        case HELP_HOW.HELP_MOVING_ITEMS:
        case HELP_HOW.HELP_USING_PLAYERS_PC:
        case HELP_HOW.HELP_USING_WITHDRAW_ITEM:
        case HELP_HOW.HELP_USING_DEPOSIT_ITEM:
        case HELP_HOW.HELP_USING_MAILBOX:
        case HELP_HOW.HELP_OPENING_MENU:
        case HELP_HOW.HELP_USING_BAG2:
        case HELP_HOW.HELP_USING_HOME_PC:
        case HELP_HOW.HELP_USING_ITEM_STORAGE:
        case HELP_HOW.HELP_USING_WITHDRAW_ITEM2:
        case HELP_HOW.HELP_USING_DEPOSIT_ITEM2:
        case HELP_HOW.HELP_USING_MAILBOX2:
        case HELP_HOW.HELP_USING_BALL:
        case HELP_HOW.HELP_USING_BAIT:
        case HELP_HOW.HELP_USING_ROCK:
            return true;
        case HELP_HOW.HELP_USING_POKEDEX:
        case HELP_HOW.HELP_USING_PROF_OAKS_PC:
        case HELP_HOW.HELP_READING_POKEDEX:
            return flagGet(C.FLAG_SYS_POKEDEX_GET);
        case HELP_HOW.HELP_USING_TOWN_MAP:
            return checkBagHasItem(C.ITEM_TOWN_MAP, 1);
        case HELP_HOW.HELP_USING_POKEMON:
        case HELP_HOW.HELP_USING_SUMMARY:
        case HELP_HOW.HELP_USING_ITEM:
        case HELP_HOW.HELP_USING_AN_ITEM:
        case HELP_HOW.HELP_USING_KEYITEM:
        case HELP_HOW.HELP_USING_POKEBALL:
        case HELP_HOW.HELP_USING_POTION:
        case HELP_HOW.HELP_USING_FIGHT:
        case HELP_HOW.HELP_USING_POKEMON2:
        case HELP_HOW.HELP_USING_SUMMARY2:
        case HELP_HOW.HELP_USING_RUN:
        case HELP_HOW.HELP_REGISTER_KEY_ITEM:
            return flagGet(C.FLAG_SYS_POKEMON_GET);
        case HELP_HOW.HELP_USING_SWITCH:
        case HELP_HOW.HELP_USING_SHIFT:
            // Only show if player has caught mon after starter
            if (GetKantoPokedexCount(C.FLAG_GET_CAUGHT) > 1)
                return true;
            return false;
        case HELP_HOW.HELP_USING_TM:
            return flagGet(C.FLAG_BADGE01_GET);
        case HELP_HOW.HELP_USING_HM:
        case HELP_HOW.HELP_USING_MOVE_OUTSIDE_OF_BATTLE:
            return HasGottenAtLeastOneHM();
        case HELP_HOW.HELP_RIDING_BICYCLE:
            return flagGet(C.FLAG_GOT_BICYCLE);
        case HELP_HOW.HELP_USING_HALL_OF_FAME:
            return flagGet(C.FLAG_SYS_GAME_CLEAR);
        }
        return false;
    }
    if (gHelpSystemState.topic === TOPIC_TERMS)
    {
        if (HelpSystem_ShouldShowBasicTerms())
        {
            // After defeating Brock, all basic terms are added
            // This checks to make sure they arent added twice
            for (i = 0; sTerms_Basic()[i] !== HELP_END; i++)
            {
                if (sTerms_Basic()[i] === id)
                    return false;
            }
        }
        switch (id)
        {
        case HELP_TERM.HELP_TERM_MONEY:
        case HELP_TERM.HELP_TERM_ID_NO:
        case HELP_TERM.HELP_TERM_ITEMS:
        case HELP_TERM.HELP_TERM_KEYITEMS:
        case HELP_TERM.HELP_TERM_POKEBALLS:
        case HELP_TERM.HELP_TERM_POKEDEX:
        case HELP_TERM.HELP_TERM_PLAY_TIME:
        case HELP_TERM.HELP_TERM_BADGES:
        case HELP_TERM.HELP_TERM_TEXT_SPEED:
        case HELP_TERM.HELP_TERM_BATTLE_SCENE:
        case HELP_TERM.HELP_TERM_BATTLE_STYLE:
        case HELP_TERM.HELP_TERM_SOUND:
        case HELP_TERM.HELP_TERM_BUTTON_MODE:
        case HELP_TERM.HELP_TERM_FRAME:
        case HELP_TERM.HELP_TERM_CANCEL:
        case HELP_TERM.HELP_TERM_TM:
        case HELP_TERM.HELP_TERM_EVOLUTION:
            return true;
        case HELP_TERM.HELP_TERM_HP:
        case HELP_TERM.HELP_TERM_EXP:
        case HELP_TERM.HELP_TERM_ATTACK:
        case HELP_TERM.HELP_TERM_DEFENSE:
        case HELP_TERM.HELP_TERM_SPATK:
        case HELP_TERM.HELP_TERM_SPDEF:
        case HELP_TERM.HELP_TERM_SPEED:
        case HELP_TERM.HELP_TERM_LEVEL:
        case HELP_TERM.HELP_TERM_TYPE:
        case HELP_TERM.HELP_TERM_OT:
        case HELP_TERM.HELP_TERM_ITEM:
        case HELP_TERM.HELP_TERM_ABILITY:
        case HELP_TERM.HELP_TERM_NATURE:
        case HELP_TERM.HELP_TERM_POWER:
        case HELP_TERM.HELP_TERM_ACCURACY:
        case HELP_TERM.HELP_TERM_FNT:
            return flagGet(C.FLAG_SYS_POKEMON_GET);
        case HELP_TERM.HELP_TERM_HM:
        case HELP_TERM.HELP_TERM_HM_MOVE:
            return HasGottenAtLeastOneHM();
        case HELP_TERM.HELP_TERM_MOVES:
        case HELP_TERM.HELP_TERM_MOVE_TYPE:
        case HELP_TERM.HELP_TERM_PP:
        case HELP_TERM.HELP_TERM_STATUS_PROBLEM:
            return flagGet(C.FLAG_WORLD_MAP_VIRIDIAN_FOREST);
        }
        return true;
    }
    if (gHelpSystemState.topic === TOPIC_ABOUT_GAME)
    {
        switch (id)
        {
        case HELP_GENERAL.HELP_GAME_FUNDAMENTALS_2:
            return flagGet(C.FLAG_BADGE01_GET);
        case HELP_GENERAL.HELP_GAME_FUNDAMENTALS_3:
            return flagGet(C.FLAG_BADGE02_GET);
        }
        return true;
    }
    if (gHelpSystemState.topic === TOPIC_TYPE_MATCHUP)
    {
        return true;
    }

    return false;
}
/** HelpSystem_UpdateHasntSeenIntro (help_system.c). */
export function HelpSystem_UpdateHasntSeenIntro(): boolean {
  if (sSeenHelpSystemIntro) return false;
  if (flagGet(C.FLAG_SYS_SAW_HELP_SYSTEM_INTRO)) return false;
  flagSet(C.FLAG_SYS_SAW_HELP_SYSTEM_INTRO);
  sSeenHelpSystemIntro = true;
  return true;
}

/** HelpSystem_IsSinglePlayer (help_system.c). */
export function HelpSystem_IsSinglePlayer(): boolean {
  return getReceivedRemoteLinkPlayers() !== 1;
}

/** ResetHelpSystemListMenu (help_system.c). */
function ResetHelpSystemListMenu(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): void {
  helpListMenu.sub.items = listMenuItemsBuffer;
  helpListMenu.sub.totalItems = 1;
  helpListMenu.sub.maxShowed = 1;
  helpListMenu.sub.left = 1;
  helpListMenu.sub.top = 4;
}

/** BuildAndPrintMainTopicsListMenu (help_system.c). */
function BuildAndPrintMainTopicsListMenu(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): void {
  ResetHelpSystemListMenu(helpListMenu, listMenuItemsBuffer);
  BuildMainTopicsListAndMoveToH00(helpListMenu, listMenuItemsBuffer);
  PrintTextOnPanel2Row52RightAlign(rom.text("gText_HelpSystemControls_PickOkEnd"));
  HelpSystem_InitListMenuController(helpListMenu, 0, gHelpSystemState.scrollMain);
  PrintHelpSystemTopicMouseoverDescription(helpListMenu, listMenuItemsBuffer);
  HS_ShowOrHideMainWindowText(1);
  HS_ShowOrHideControlsGuideInTopRight(1);
}

/** BuildMainTopicsListAndMoveToH00 (help_system.c). */
function BuildMainTopicsListAndMoveToH00(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): void {
  const flags = hs<number[][]>("sHelpSystemContextTopicFlags");
  const order = hs<number[]>("sHelpSystemContextTopicOrder");
  let totalItems = 0;
  for (let i = 0; i < TOPIC_COUNT; i++) {
    if (flags[contextId][order[i]] === 1) {
      listMenuItemsBuffer[totalItems].label = ptrTable("sHelpSystemTopicPtrs", order[i]);
      listMenuItemsBuffer[totalItems].index = order[i];
      totalItems++;
    }
  }
  listMenuItemsBuffer[totalItems - 1].index = -2;
  helpListMenu.sub.totalItems = totalItems;
  helpListMenu.sub.maxShowed = totalItems;
  helpListMenu.sub.left = 0;
}

/** BuildAndPrintSubmenuList (help_system.c). */
function BuildAndPrintSubmenuList(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): void {
  HS_SetMainWindowBgBrightness(0);
  HS_ShowOrHideHeaderLine_Darker_FooterStyle(0);
  HS_ShowOrHideHeaderAndFooterLines_Lighter(1);
  ResetHelpSystemListMenu(helpListMenu, listMenuItemsBuffer);
  SetHelpSystemSubmenuItems(helpListMenu, listMenuItemsBuffer);
  PrintTextOnPanel2Row52RightAlign(rom.text("gText_HelpSystemControls_PickOkCancel"));
  HelpSystem_InitListMenuController(helpListMenu, helpListMenu.itemsAbove, helpListMenu.cursorPos);
  HelpSystem_PrintTextAt(ptrTable("sHelpSystemTopicPtrs", gHelpSystemState.topic), 0, 0);
  HS_ShowOrHideMainWindowText(1);
  HS_ShowOrHideControlsGuideInTopRight(1);
}

/** SetHelpSystemSubmenuItems (help_system.c). */
function SetHelpSystemSubmenuItems(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): void {
  let totalItems = 0;
  const listRef = hs<SymPtr[]>("sHelpSystemSubmenuItemLists")[contextId * 5 + gHelpSystemState.topic];
  const submenuItems = listRef ? hs<number[]>(listRef.$sym) : [HELP_END];
  const labelTable = (): string => {
    switch (gHelpSystemState.topic) {
      case TOPIC_WHAT_TO_DO: return "sHelpSystemSpecializedQuestionTextPtrs";
      case TOPIC_HOW_TO_DO: return "sHelpSystemMenuTopicTextPtrs";
      case TOPIC_TERMS: return "sHelpSystemTermTextPtrs";
      case TOPIC_ABOUT_GAME: return "sHelpSystemGeneralTopicTextPtrs";
      default: return "sHelpSystemTypeMatchupTextPtrs"; // TOPIC_TYPE_MATCHUP
    }
  };
  for (let i = 0; submenuItems[i] !== HELP_END; i++) {
    if (IsHelpSystemSubmenuEnabled(submenuItems[i])) {
      listMenuItemsBuffer[totalItems].label = ptrTable(labelTable(), submenuItems[i]);
      listMenuItemsBuffer[totalItems].index = submenuItems[i];
      totalItems++;
    }
  }
  if (HelpSystem_ShouldShowBasicTerms()) {
    const basic = sTerms_Basic();
    for (let i = 0; basic[i] !== HELP_END; i++) {
      listMenuItemsBuffer[totalItems].label = ptrTable("sHelpSystemTermTextPtrs", basic[i]);
      listMenuItemsBuffer[totalItems].index = basic[i];
      totalItems++;
    }
  }
  listMenuItemsBuffer[totalItems].label = rom.text("Help_Text_Cancel");
  listMenuItemsBuffer[totalItems].index = -2;
  totalItems++;
  helpListMenu.sub.totalItems = totalItems;
  helpListMenu.sub.maxShowed = 7;
  helpListMenu.sub.left = 0;
  helpListMenu.sub.top = 21;
}

/** HelpSystem_ShouldShowBasicTerms (help_system.c). */
function HelpSystem_ShouldShowBasicTerms(): boolean {
  return flagGet(C.FLAG_DEFEATED_BROCK) && gHelpSystemState.topic === TOPIC_TERMS;
}

/** HasGottenAtLeastOneHM (help_system.c). */
function HasGottenAtLeastOneHM(): boolean {
  return flagGet(C.FLAG_GOT_HM01) || flagGet(C.FLAG_GOT_HM02) || flagGet(C.FLAG_GOT_HM03)
    || flagGet(C.FLAG_GOT_HM04) || flagGet(C.FLAG_GOT_HM05) || flagGet(C.FLAG_GOT_HM06)
    || flagGet(C.FLAG_HIDE_FOUR_ISLAND_ICEFALL_CAVE_1F_HM07);
}

/** RunHelpMenuSubroutine (help_system.c). */
export function RunHelpMenuSubroutine(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  switch (helpListMenu.state) {
    case 8: return HelpSystemSubroutine_PrintWelcomeMessage(helpListMenu, listMenuItemsBuffer);
    case 9: return HelpSystemSubroutine_WelcomeWaitButton(helpListMenu, listMenuItemsBuffer);
    case 10: return HelpSystemSubroutine_WelcomeEndGotoMenu(helpListMenu, listMenuItemsBuffer);
    case 0: return HelpSystemSubroutine_MenuInputHandlerMain(helpListMenu, listMenuItemsBuffer);
    case 1: return HelpMenuSubroutine_InitSubmenu(helpListMenu, listMenuItemsBuffer);
    case 2: return HelpMenuSubroutine_ReturnFromSubmenu(helpListMenu, listMenuItemsBuffer);
    case 3: return HelpMenuSubroutine_SubmenuInputHandler(helpListMenu, listMenuItemsBuffer);
    case 4: return HelpMenuSubroutine_HelpItemPrint(helpListMenu, listMenuItemsBuffer);
    case 5: return HelpMenuSubroutine_ReturnFromHelpItem(helpListMenu, listMenuItemsBuffer);
    case 6: return HelpMenuSubroutine_HelpItemWaitButton(helpListMenu, listMenuItemsBuffer);
  }
  return false;
}

/** HelpSystemSubroutine_PrintWelcomeMessage (help_system.c). */
export function HelpSystemSubroutine_PrintWelcomeMessage(helpListMenu: HelpSystemListMenu, _listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  PrintTextOnPanel2Row52RightAlign(rom.text("gText_HelpSystemControls_A_Next"));
  PrintWelcomeMessageOnPanel1();
  HS_ShowOrHideMainWindowText(1);
  HS_ShowOrHideControlsGuideInTopRight(1);
  helpListMenu.state = 9;
  return true;
}

/** HelpSystemSubroutine_WelcomeWaitButton (help_system.c). */
export function HelpSystemSubroutine_WelcomeWaitButton(helpListMenu: HelpSystemListMenu, _listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    helpListMenu.state = 10;
  }
  return true;
}

/** HelpSystemSubroutine_WelcomeEndGotoMenu (help_system.c). */
export function HelpSystemSubroutine_WelcomeEndGotoMenu(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  gHelpSystemState.scrollMain = 0;
  ResetHelpSystemCursor(helpListMenu);
  BuildAndPrintMainTopicsListMenu(helpListMenu, listMenuItemsBuffer);
  helpListMenu.state = 0;
  return true;
}

/** HelpSystemSubroutine_MenuInputHandlerMain (help_system.c). */
export function HelpSystemSubroutine_MenuInputHandlerMain(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  const input = HelpSystem_GetMenuInput();
  switch (input) {
    case -6:
    case -2:
      return false;
    case -5:
    case -4:
      PrintHelpSystemTopicMouseoverDescription(helpListMenu, listMenuItemsBuffer);
      break;
    case -3:
    case -1:
      break;
    default:
      gHelpSystemState.topic = input;
      helpListMenu.state = 1;
      break;
  }
  return true;
}

/** HelpMenuSubroutine_InitSubmenu (help_system.c). */
export function HelpMenuSubroutine_InitSubmenu(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  gHelpSystemState.level = 1;
  gHelpSystemState.scrollMain = helpListMenu.cursorPos;
  ResetHelpSystemCursor(helpListMenu);
  BuildAndPrintSubmenuList(helpListMenu, listMenuItemsBuffer);
  HS_UpdateMenuScrollArrows();
  HelpSystem_SetInputDelay(2);
  helpListMenu.state = 3;
  return true;
}

/** HelpMenuSubroutine_ReturnFromSubmenu (help_system.c). */
export function HelpMenuSubroutine_ReturnFromSubmenu(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  HS_ShowOrHideScrollArrows(0, 0);
  HS_ShowOrHideScrollArrows(1, 0);
  gHelpSystemState.level = 0;
  BuildAndPrintMainTopicsListMenu(helpListMenu, listMenuItemsBuffer);
  helpListMenu.state = 0;
  return true;
}

/** HelpMenuSubroutine_SubmenuInputHandler (help_system.c). */
export function HelpMenuSubroutine_SubmenuInputHandler(helpListMenu: HelpSystemListMenu, _listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  const input = HelpSystem_GetMenuInput();
  switch (input) {
    case -6:
      return false;
    case -2:
      helpListMenu.state = 2;
      break;
    case -5:
    case -4:
    case -3:
    case -1:
      break;
    default:
      gHelpSystemState.scrollSub = input;
      helpListMenu.state = 4;
      break;
  }
  return true;
}

/** HelpSystem_PrintTopicLabel (help_system.c). */
export function HelpSystem_PrintTopicLabel(): void {
  HelpSystem_PrintTextAt(ptrTable("sHelpSystemTopicPtrs", gHelpSystemState.topic), 0, 0);
}

/** HelpMenuSubroutine_HelpItemPrint (help_system.c). */
export function HelpMenuSubroutine_HelpItemPrint(helpListMenu: HelpSystemListMenu, _listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  gHelpSystemState.level = 2;
  HS_ShowOrHideMainWindowText(0);
  HelpSystem_FillPanel1();
  PrintTextOnPanel2Row52RightAlign(rom.text("gText_HelpSystemControls_AorBtoCancel"));
  HS_SetMainWindowBgBrightness(1);
  HS_ShowOrHideHeaderAndFooterLines_Darker(1);
  const sub = gHelpSystemState.scrollSub;
  switch (gHelpSystemState.topic) {
    case TOPIC_WHAT_TO_DO:
      HelpSystem_PrintQuestionAndAnswerPair(ptrTable("sHelpSystemSpecializedQuestionTextPtrs", sub), ptrTable("sHelpSystemSpecializedAnswerTextPtrs", sub));
      break;
    case TOPIC_HOW_TO_DO:
      HelpSystem_PrintQuestionAndAnswerPair(ptrTable("sHelpSystemMenuTopicTextPtrs", sub), ptrTable("sHelpSystemHowToUseMenuTextPtrs", sub));
      break;
    case TOPIC_TERMS:
      HelpSystem_PrintQuestionAndAnswerPair(ptrTable("sHelpSystemTermTextPtrs", sub), ptrTable("sHelpSystemTermDefinitionsTextPtrs", sub));
      break;
    case TOPIC_ABOUT_GAME:
      HelpSystem_PrintQuestionAndAnswerPair(ptrTable("sHelpSystemGeneralTopicTextPtrs", sub), ptrTable("sHelpSystemGeneralTopicDescriptionTextPtrs", sub));
      break;
    default: // TOPIC_TYPE_MATCHUP
      HelpSystem_PrintQuestionAndAnswerPair(ptrTable("sHelpSystemTypeMatchupTextPtrs", sub), ptrTable("sHelpSystemTypeMatchupDescriptionTextPtrs", sub));
      break;
  }
  HS_ShowOrHideMainWindowText(1);
  HS_ShowOrHideControlsGuideInTopRight(1);
  helpListMenu.state = 6;
  return true;
}

/** HelpMenuSubroutine_ReturnFromHelpItem (help_system.c). */
export function HelpMenuSubroutine_ReturnFromHelpItem(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  gHelpSystemState.level = 1;
  BuildAndPrintSubmenuList(helpListMenu, listMenuItemsBuffer);
  HS_UpdateMenuScrollArrows();
  HelpSystem_SetInputDelay(2);
  helpListMenu.state = 3;
  return true;
}

/** HelpMenuSubroutine_HelpItemWaitButton (help_system.c). */
export function HelpMenuSubroutine_HelpItemWaitButton(helpListMenu: HelpSystemListMenu, _listMenuItemsBuffer: HelpListMenuItem[]): boolean {
  if ((joy.newKeys & B_BUTTON) || (joy.newKeys & A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    helpListMenu.state = 5;
    return true;
  }
  if (joy.newKeys & (L_BUTTON | R_BUTTON)) return false;
  return true;
}

/** PrintWelcomeMessageOnPanel1 (help_system.c). */
function PrintWelcomeMessageOnPanel1(): void {
  HelpSystem_FillPanel1();
  HelpSystem_PrintTextAt(rom.text("Help_Text_Greetings"), 0, 0);
}

/** PrintTextOnPanel2Row52RightAlign (help_system.c). */
function PrintTextOnPanel2Row52RightAlign(str: ArrayLike<number>): void {
  HelpSystem_FillPanel2();
  HelpSystem_PrintTextRightAlign_Row52(str);
}

/** GetHelpSystemMenuLevel (help_system.c). */
export function GetHelpSystemMenuLevel(): number {
  return gHelpSystemState.level;
}

/** ResetHelpSystemCursor (help_system.c). */
function ResetHelpSystemCursor(helpListMenu: HelpSystemListMenu): void {
  helpListMenu.itemsAbove = 0;
  helpListMenu.cursorPos = 0;
}

/** PrintHelpSystemTopicMouseoverDescription (help_system.c). */
function PrintHelpSystemTopicMouseoverDescription(helpListMenu: HelpSystemListMenu, listMenuItemsBuffer: HelpListMenuItem[]): void {
  const index = listMenuItemsBuffer[helpListMenu.itemsAbove + helpListMenu.cursorPos].index;
  if (index === -2) HelpSystem_PrintTopicMouseoverDescription(ptrTable("sHelpSystemTopicMouseoverDescriptionPtrs", TOPIC_EXIT));
  else HelpSystem_PrintTopicMouseoverDescription(ptrTable("sHelpSystemTopicMouseoverDescriptionPtrs", index));
  HS_ShowOrHideToplevelTooltipWindow(1);
}
