export type Direction = "south" | "north" | "west" | "east";

export const GFX_MAP: Record<string, { file: string; w: number; h: number; frames?: number }> = {
  OBJ_EVENT_GFX_BALDING_MAN: { file: "objects/baldingman__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_BEAUTY: { file: "objects/beauty__npcblue.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_BIKER: { file: "objects/biker__npcpink.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_BILL: { file: "objects/bill__npcblue.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_BLACK_BELT: { file: "objects/blackbelt__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_BLUE: { file: "objects/blue__npcgreen.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_BOY: { file: "objects/boy__npcgreen.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_BUG_CATCHER: { file: "objects/bugcatcher__npcgreen.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_CAMPER: { file: "objects/camper__npcgreen.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_COOLTRAINER_M: { file: "objects/cooltrainerm__npcblue.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_CRUSH_GIRL: { file: "objects/crushgirl__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_CUT_TREE: { file: "objects/cuttree__npcgreen.png", w: 16, h: 16 },
  OBJ_EVENT_GFX_FISHER: { file: "objects/fisher__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_HIKER: { file: "objects/hiker__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_ITEM_BALL: { file: "objects/itemball__npcwhite.png", w: 16, h: 16 },
  OBJ_EVENT_GFX_LASS: { file: "objects/lass__npcblue.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_LITTLE_GIRL: { file: "objects/littlegirl__npcpink.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_MAN: { file: "objects/man__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_OLD_MAN_1: { file: "objects/oldman1__npcpink.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_PICNICKER: { file: "objects/picnicker__npcgreen.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_POKE_MANIAC: { file: "objects/pokemaniac__npcpink.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_POLICEMAN: { file: "objects/policeman__npcblue.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_PROF_OAK: { file: "objects/profoak__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_ROCKER: { file: "objects/rocker__npcblue.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_ROCKET_M: { file: "objects/rocketm__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_SCIENTIST: { file: "objects/scientist__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_SEAGALLOP: { file: "objects/seagallop__seagallop.png", w: 64, h: 64 },
  OBJ_EVENT_GFX_SLOWBRO: { file: "objects/slowbro__npcpink.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_SNORLAX: { file: "objects/snorlax__npcblue.png", w: 32, h: 32 },
  OBJ_EVENT_GFX_SWIMMER_F_WATER: { file: "objects/swimmerfwater__npcgreen.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_SWIMMER_M_LAND: { file: "objects/swimmermland__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_SWIMMER_M_WATER: { file: "objects/swimmermwater__npcwhite.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_TUBER_M_WATER: { file: "objects/tubermwater__npcblue.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_VAR_0: { file: "objects/oldmanlyingdown__npcpink.png", w: 32, h: 16 },
  OBJ_EVENT_GFX_WOMAN_1: { file: "objects/woman1__npcgreen.png", w: 16, h: 32 },
  OBJ_EVENT_GFX_YOUNGSTER: { file: "objects/youngster__npcblue.png", w: 16, h: 32 },
};

export function getPlayerSpriteSheet(char: "red" | "leaf", vehicle: "walk" | "bike" | "surf", isRunning = false): string {
  const isLeaf = char === "leaf";
  if (vehicle === "bike") {
    return isLeaf ? "/fr/objects/greenbike__player.png" : "/fr/objects/redbike__player.png";
  }
  if (vehicle === "surf") {
    return isLeaf ? "/fr/objects/greensurfrun__player.png" : "/fr/objects/redsurfrun__player.png";
  }
  if (isRunning) {
    return isLeaf ? "/fr/objects/greensurfrun__player.png" : "/fr/objects/redsurfrun__player.png";
  }
  return isLeaf ? "/fr/objects/greennormal__player.png" : "/fr/objects/rednormal__player.png";
}
