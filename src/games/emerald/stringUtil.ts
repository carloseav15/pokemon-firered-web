// pokeemerald string_util.c ConvertIntToDecimalStringN. It differs from pokefirered's only in the
// padding character of STR_CONV_MODE_RIGHT_ALIGN: CHAR_SPACER (0x77) instead of CHAR_SPACE.
import { EOS } from "@core/gba/charmap";

export const STR_CONV_MODE_LEFT_ALIGN = 0;
export const STR_CONV_MODE_RIGHT_ALIGN = 1;
export const STR_CONV_MODE_LEADING_ZEROS = 2;

const CHAR_0 = 0xa1;
const CHAR_QUESTION_MARK = 0xac;
const CHAR_SPACER = 0x77;
const sPowersOfTen = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000];

/** Writes at dest[destOffset..]; returns the index of the EOS it wrote (C returns that pointer). */
export function ConvertIntToDecimalStringN(dest: Uint8Array, value: number, mode: number, n: number, destOffset = 0): number {
  const WAITING_FOR_NONZERO_DIGIT = 0, WRITING_DIGITS = 1, WRITING_SPACES = 2;
  let state = WAITING_FOR_NONZERO_DIGIT;
  if (mode === STR_CONV_MODE_RIGHT_ALIGN) state = WRITING_SPACES;
  if (mode === STR_CONV_MODE_LEADING_ZEROS) state = WRITING_DIGITS;
  value |= 0;
  let out = destOffset;
  for (let powerOfTen = sPowersOfTen[n - 1]!; powerOfTen > 0; powerOfTen = Math.trunc(powerOfTen / 10)) {
    const digit = Math.trunc(value / powerOfTen) & 0xffff;
    const temp = (value - powerOfTen * digit) | 0;
    if (state === WRITING_DIGITS) {
      dest[out++] = digit <= 9 ? CHAR_0 + digit : CHAR_QUESTION_MARK;
    } else if (digit !== 0 || powerOfTen === 1) {
      state = WRITING_DIGITS;
      dest[out++] = digit <= 9 ? CHAR_0 + digit : CHAR_QUESTION_MARK;
    } else if (state === WRITING_SPACES) {
      dest[out++] = CHAR_SPACER;
    }
    value = temp;
  }
  dest[out] = EOS;
  return out;
}
