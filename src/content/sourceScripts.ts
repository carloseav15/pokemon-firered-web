import type { ScriptInstruction } from "../engine/ScriptVM";

type SourceEntry = { lines: string[]; flag?: string; value?: boolean };

const sourceEntries: Record<string, SourceEntry> = {
  PalletTown_EventScript_SignLady: { lines: ["Hmm… Is that right…", "Oh! Look, look!", "Read it, read it!"] },
  PalletTown_EventScript_SignLadyDone: { lines: ["I'm raising POKéMON, too.", "When they get strong, they can protect me."] },
  PalletTown_EventScript_FatMan: { lines: ["Technology is incredible!", "You can now store and recall items and POKéMON as data via PC."] },
  PalletTown_EventScript_OaksLabSign: { lines: ["OAK POKéMON RESEARCH LAB"] },
  PalletTown_EventScript_PlayersHouseSign: { lines: ["{PLAYER}'s house"] },
  PalletTown_EventScript_RivalsHouseSign: { lines: ["{RIVAL}'s house"] },
  PalletTown_EventScript_TownSign: { lines: ["PALLET TOWN\nShades of your journey await!"] },
  PalletTown_EventScript_TrainerTips: { lines: ["TRAINER TIPS\nPress START to open the MENU!"] },
  PalletTown_PlayersHouse_1F_EventScript_Mom: { lines: ["MOM: …Right.\nAll boys leave home someday. It said so on TV.\nOh, yes. PROF. OAK, next door, was looking for you."] },
  PalletTown_PlayersHouse_1F_EventScript_MomHeal: { lines: ["MOM: {PLAYER}!\nYou should take a quick rest.", "MOM: Oh, good! You and your POKéMON are looking great.\nTake care now!"] },
  PalletTown_PlayersHouse_1F_EventScript_TV: { lines: ["Oops, wrong side…"] },
  PalletTown_PlayersHouse_1F_EventScript_TVScreenMale: { lines: ["There's a movie on TV.\nFour boys are walking on railroad tracks.\n…I better go, too."] },
  PalletTown_PlayersHouse_1F_EventScript_TVScreenFemale: { lines: ["There's a movie on TV.\nA girl with her hair in pigtails is walking up a brick road.\n…I better go, too."] },
  PalletTown_PlayersHouse_2F_EventScript_NES: { lines: ["{PLAYER} played with the NES.\n…Okay! It's time to go!"] },
  PalletTown_PlayersHouse_2F_EventScript_Sign: { lines: ["It's a posted notice…\nIf you're confused, ask for HELP!\nPress the L or R Button!"] },
  PalletTown_RivalsHouse_EventScript_Daisy: { lines: ["DAISY: Hi, {PLAYER}!\nMy brother, {RIVAL}, is out at Grandpa's LAB."] },
  PalletTown_RivalsHouse_EventScript_HeardBattledRival: { lines: ["DAISY: {PLAYER}, I heard you had a battle against {RIVAL}.\nI wish I'd seen that!"] },
  PalletTown_RivalsHouse_EventScript_ExplainTownMap: { lines: ["You can use the TOWN MAP to find out where you are, or check the names of places."] },
  PalletTown_RivalsHouse_EventScript_TownMap: { lines: ["It's a big map of the KANTO region.\nNow this would be useful!"] },
  PalletTown_RivalsHouse_EventScript_Bookshelf: { lines: ["The shelves are crammed full of books on POKéMON."] },
  PalletTown_RivalsHouse_EventScript_Picture: { lines: ["The lovely and sweet CLEFAIRY"] },
  PalletTown_ProfessorOaksLab_EventScript_ProfOak: { lines: ["OAK: Now, {PLAYER}.\nInside those three POKé BALLS are POKéMON.\nWhich one will you choose for yourself?"] },
  PalletTown_ProfessorOaksLab_EventScript_BulbasaurBall: { lines: ["Those are POKé BALLS.\nThey contain POKéMON!"] },
  PalletTown_ProfessorOaksLab_EventScript_SquirtleBall: { lines: ["Those are POKé BALLS.\nThey contain POKéMON!"] },
  PalletTown_ProfessorOaksLab_EventScript_CharmanderBall: { lines: ["Those are POKé BALLS.\nThey contain POKéMON!"] },
  PalletTown_ProfessorOaksLab_EventScript_LastPokeBall: { lines: ["That's PROF. OAK's last POKéMON."] },
  PalletTown_ProfessorOaksLab_EventScript_Aide1: { lines: ["I study POKéMON as PROF. OAK's AIDE."] },
  PalletTown_ProfessorOaksLab_EventScript_Aide2: { lines: ["I study POKéMON as PROF. OAK's AIDE."] },
  PalletTown_ProfessorOaksLab_EventScript_Aide3: { lines: ["PROF. OAK is the authority on POKéMON."] },
  PalletTown_ProfessorOaksLab_EventScript_Pokedex: { lines: ["It's like an encyclopedia, but the pages are blank."] },
  PalletTown_ProfessorOaksLab_EventScript_LeftSign: { lines: ["Press START to open the MENU!"] },
  PalletTown_ProfessorOaksLab_EventScript_RightSign: { lines: ["The SAVE option is on the MENU.\nUse it regularly."] },
  PalletTown_ProfessorOaksLab_EventScript_Computer: { lines: ["There's an e-mail message here.\nFinally! The ultimate TRAINERS of the POKéMON LEAGUE are ready to take on all comers!"] },
  Route1_EventScript_MartClerk: { lines: ["Hi! I work at a POKéMON MART.\nIt's part of a convenient chain selling all sorts of items.\nPlease, visit us in VIRIDIAN CITY.\nI know, I'll give you a sample. Here you go!"] },
  Route1_EventScript_AlreadyGotPotion: { lines: ["Please come see us if you need POKé BALLS for catching POKéMON."] },
  Route1_EventScript_Boy: { lines: ["See those ledges along the road?\nIt's a bit scary, but you can jump from them.\nYou can get back to PALLET TOWN quicker that way."] },
  Route1_EventScript_RouteSign: { lines: ["ROUTE 1\nPALLET TOWN - VIRIDIAN CITY"] },
};

export function sourceDialogueForScript(script?: string): string[] | undefined {
  if (!script) return undefined;
  return sourceEntries[script]?.lines;
}

export function sourceInstructionsForScript(script?: string): ScriptInstruction[] {
  if (script === "PalletTown_ProfessorOaksLab_EventScript_ProfOak") return [
    { type: "goto_if_variable", key: "VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB", operator: "ge", value: 3, label: "has_starter" },
    { type: "say", lines: ["OAK: Now, {PLAYER}. Inside those three POKé BALLS are POKéMON.", "Which one will you choose for yourself?"] },
    { type: "end" },
    { type: "label", name: "has_starter" },
    { type: "say", lines: ["OAK: If a wild POKéMON appears, your POKéMON can battle it.", "With it at your side, you should be able to reach the next town."] },
    { type: "end" },
  ];
  if (script === "PalletTown_ProfessorOaksLab_EventScript_Rival") return [
    { type: "goto_if_variable", key: "VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB", operator: "ge", value: 3, label: "has_starter" },
    { type: "goto_if_variable", key: "VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB", operator: "eq", value: 2, label: "choose_starter" },
    { type: "say", lines: ["{RIVAL}: Gramps isn't around."] },
    { type: "end" },
    { type: "label", name: "choose_starter" },
    { type: "say", lines: ["{RIVAL}: Go ahead and choose, {PLAYER}!"] },
    { type: "end" },
    { type: "label", name: "has_starter" },
    { type: "say", lines: ["{RIVAL}: My POKéMON looks a lot tougher than yours."] },
    { type: "end" },
  ];
  const entry = script ? sourceEntries[script] : undefined;
  if (!entry) return [];
  const instructions: ScriptInstruction[] = [{ type: "say", lines: entry.lines }];
  if (entry.flag) instructions.push({ type: "set_flag", flag: entry.flag, value: entry.value });
  return instructions;
}
