// GBA text encoding helpers (charmap.txt) and the string utilities from
// string_util.c used by scripts and menus.

import { rom } from "../rom";
import { STRING_VAR4_LENGTH, stringVars } from "./stringBuffers";

export const EOS = 0xff;
export const CHAR_NEWLINE = 0xfe;
export const CHAR_PROMPT_SCROLL = 0xfa;
export const CHAR_PROMPT_CLEAR = 0xfb;
export const EXT_CTRL_CODE_BEGIN = 0xfc;
export const PLACEHOLDER_BEGIN = 0xfd;
export const CHAR_EXTRA_SYMBOL = 0xf9;
export const CHAR_KEYPAD_ICON = 0xf8;
export const CHAR_SPACE = 0x00;

export type GbaString = Uint8Array;

let reverse: Map<number, string> | undefined;

/** Encode a JS string into the game charset. `{NAME}` inserts named charmap sequences. */
export function encode(text: string, terminate = true): GbaString {
  const out: number[] = [];
  const chars = rom.charmap.chars;
  const names = (rom.charmap as unknown as { names: Record<string, number[]> }).names;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      const end = text.indexOf("}", i);
      const name = text.slice(i + 1, end);
      const seq = names[name];
      if (seq) out.push(...seq);
      i = end;
      continue;
    }
    if (c === "\n") { out.push(CHAR_NEWLINE); continue; }
    const code = chars[c];
    out.push(code ?? 0xac); // '?'
  }
  if (terminate) out.push(EOS);
  return Uint8Array.from(out);
}

/** Decode a GBA string for debugging and logs. */
export function decode(bytes: ArrayLike<number>): string {
  if (!reverse) {
    reverse = new Map();
    for (const [c, code] of Object.entries(rom.charmap.chars)) if (!reverse.has(code)) reverse.set(code, c);
  }
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === EOS) break;
    if (b === EXT_CTRL_CODE_BEGIN) { i += extCtrlCodeLength(bytes[i + 1]); continue; }
    if (b === PLACEHOLDER_BEGIN) { i++; out += "{PH}"; continue; }
    if (b === CHAR_NEWLINE) { out += "\n"; continue; }
    if (b === CHAR_PROMPT_SCROLL || b === CHAR_PROMPT_CLEAR) { out += "\n"; continue; }
    out += reverse.get(b) ?? "?";
  }
  return out;
}

import {
  GetExtCtrlCodeLength,
  SkipExtCtrlCode,
  StringLength,
  StringCopy,
  StringAppend,
  StringCopyN,
  StringAppendN,
  StringCompare,
  StringCompareN,
  StringFill,
  StringFillWithTerminator,
  StringCopyPadded,
  StripExtCtrlCodes,
  StringCompareWithoutExtCtrlCodes,
  StringCopy_Nickname,
  StringGet_Nickname,
  StringCopy_PlayerName,
  ConvertIntToDecimalStringN,
  ConvertIntToHexStringN,
  StringCopyN_Multibyte,
  StringLength_Multibyte,
  WriteColorChangeControlCode,
  ConvertInternationalString,
  StringExpandPlaceholders,
  StringBraille,
  GetExpandedPlaceholder,
} from "../generated/stringUtil";

export {
  GetExtCtrlCodeLength,
  SkipExtCtrlCode,
  StringLength,
  StringCopy,
  StringAppend,
  StringCopyN,
  StringAppendN,
  StringCompare,
  StringCompareN,
  StringFill,
  StringFillWithTerminator,
  StringCopyPadded,
  StripExtCtrlCodes,
  StringCompareWithoutExtCtrlCodes,
  StringCopy_Nickname,
  StringGet_Nickname,
  StringCopy_PlayerName,
  ConvertIntToDecimalStringN,
  ConvertIntToHexStringN,
  StringCopyN_Multibyte,
  StringLength_Multibyte,
  WriteColorChangeControlCode,
  ConvertInternationalString,
  StringExpandPlaceholders,
  StringBraille,
  GetExpandedPlaceholder,
};

/** Number of argument bytes following FC <code> (plus the code byte itself). */
export function extCtrlCodeLength(code: number): number {
  return GetExtCtrlCodeLength(code);
}

export function length(s: ArrayLike<number>): number {
  return StringLength(s);
}

export function concat(...parts: ArrayLike<number>[]): GbaString {
  const out: number[] = [];
  for (const part of parts) for (let i = 0; i < part.length && part[i] !== EOS; i++) out.push(part[i]);
  out.push(EOS);
  return Uint8Array.from(out);
}

export function copy(s: ArrayLike<number>): GbaString {
  const len = StringLength(s);
  const dest = new Uint8Array(len + 1);
  StringCopy(dest, s);
  return dest;
}

export const STR_CONV_MODE_LEFT_ALIGN = 0;
export const STR_CONV_MODE_RIGHT_ALIGN = 1;
export const STR_CONV_MODE_LEADING_ZEROS = 2;

/** CountDigits from field_specials.c; divisions use C's truncation toward zero. */
export function CountDigits(number: number): number {
  if (Math.trunc(number / 10) === 0) return 1;
  if (Math.trunc(number / 100) === 0) return 2;
  if (Math.trunc(number / 1000) === 0) return 3;
  if (Math.trunc(number / 10000) === 0) return 4;
  if (Math.trunc(number / 100000) === 0) return 5;
  if (Math.trunc(number / 1000000) === 0) return 6;
  if (Math.trunc(number / 10000000) === 0) return 7;
  if (Math.trunc(number / 100000000) === 0) return 8;
  return 1;
}

/** TV_PrintIntToStringVar from field_specials.c; varidx selects gStringVar1..3. */
export function TV_PrintIntToStringVar(varidx: number, number: number): void {
  const value = intToDecimal(number, STR_CONV_MODE_LEFT_ALIGN, CountDigits(number));
  if (varidx === 0) stringVars.var1 = value;
  else if (varidx === 1) stringVars.var2 = value;
  else if (varidx === 2) stringVars.var3 = value;
}

/** ConvertIntToDecimalStringN from string_util.c */
export function intToDecimal(value: number, mode = STR_CONV_MODE_LEFT_ALIGN, digits = 0): GbaString {
  const n = digits > 0 ? digits : countDigits(value);
  const dest = new Uint8Array(n + 1);
  ConvertIntToDecimalStringN(dest, value, mode, n);
  return dest;
}

export function countDigits(value: number): number {
  return Math.max(1, Math.floor(Math.abs(value)).toString().length);
}

/** Variables substituted by StringExpandPlaceholders (gStringVar1..4). */
export { stringVars };

/** StringExpandPlaceholders from string_util.c: FD xx placeholders are expanded
 *  by the generated function (gStringVar*, the save fields and the
 *  gExpandedPlaceholder_* strings). The C writes into gStringVar4; the adapter
 *  allocates a buffer of the same capacity on every call so a caller can keep
 *  the result without aliasing the next expansion, and appends EOS to sources
 *  that lack one because the C keeps reading until it finds 0xFF. */
export function expandPlaceholders(src: ArrayLike<number>): GbaString {
  let input: ArrayLike<number> = src;
  let terminated = false;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === EOS) {
      terminated = true;
      break;
    }
  }
  if (!terminated) {
    const padded = new Uint8Array(src.length + 1);
    for (let i = 0; i < src.length; i++) padded[i] = src[i];
    padded[src.length] = EOS;
    input = padded;
  }
  const dest = new Uint8Array(STRING_VAR4_LENGTH);
  return dest.slice(0, StringExpandPlaceholders(dest, input) + 1);
}
