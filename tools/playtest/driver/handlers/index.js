import { waitHandlers } from "./wait.js";
import { fieldHandlers } from "./field.js";
import { battleHandlers } from "./battle.js";
import { menuHandlers } from "./menus.js";
import { shopHandlers } from "./shop.js";
import { evolutionHandlers } from "./evolution.js";

/** Screen name -> handler. A screen that is missing here (and "unknown") stops the drive; nothing falls back to a press. */
export const DEFAULT_HANDLERS = { ...waitHandlers, ...fieldHandlers, ...battleHandlers, ...menuHandlers, ...shopHandlers, ...evolutionHandlers };
