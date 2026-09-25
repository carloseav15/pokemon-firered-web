// save_menu_util.c: format one value for the start-menu save statistics panel.

import * as C from "./generated/constants";
import { concat, intToDecimal, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { dexCount } from "./pokemon/pokemon";
import { flagGet, save, varGet } from "./save";
import { rom } from "./rom";

/** SaveStatToString; the current map section is supplied for SAVE_STAT_LOCATION. */
export function SaveStatToString(gameStatId: number, color: number, regionMapSection?: number): Uint8Array {
  const style = Uint8Array.of(C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, color & 0xff,
    C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_SHADOW, (color + 1) & 0xff);
  let value: Uint8Array;
  switch (gameStatId) {
    case C.SAVE_STAT_NAME:
      value = Uint8Array.from([...save.playerName, 0xff]);
      break;
    case C.SAVE_STAT_POKEDEX: {
      const nationalEnabled = varGet(C.VAR_NATIONAL_DEX) === 0x6258 && flagGet(C.FLAG_SYS_NATIONAL_DEX);
      value = intToDecimal(dexCount(true, !nationalEnabled), STR_CONV_MODE_LEFT_ALIGN, 3);
      break;
    }
    case C.SAVE_STAT_TIME:
    case C.SAVE_STAT_TIME_HR_RT_ALIGN: {
      const totalMinutes = Math.floor(save.playTimeFrames / 3600);
      const hours = Math.min(999, Math.floor(totalMinutes / 60));
      const minutes = hours === 999 ? 59 : totalMinutes % 60;
      const hourMode = gameStatId === C.SAVE_STAT_TIME_HR_RT_ALIGN ? STR_CONV_MODE_RIGHT_ALIGN : STR_CONV_MODE_LEFT_ALIGN;
      value = concat(intToDecimal(hours, hourMode, 3), Uint8Array.of(C.CHAR_COLON, 0xff),
        intToDecimal(minutes, STR_CONV_MODE_LEADING_ZEROS, 2));
      break;
    }
    case C.SAVE_STAT_LOCATION:
      value = regionMapSection === undefined ? Uint8Array.of(0xff) : rom.regionMapName(regionMapSection);
      break;
    case C.SAVE_STAT_BADGES: {
      const firstBadge = C.FLAG_BADGE01_GET;
      let count = 0;
      for (let flag = firstBadge; flag < firstBadge + 8; flag++) if (flagGet(flag)) count++;
      value = concat(intToDecimal(count, STR_CONV_MODE_LEFT_ALIGN, 0), rom.text("gTextJPDummy_Ko"));
      break;
    }
    default:
      value = Uint8Array.of(0xff);
      break;
  }
  return concat(style, value);
}
