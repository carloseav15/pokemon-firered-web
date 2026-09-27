// GBA text encoding helpers (charmap.txt) and the string utilities from
// string_util.c used by scripts and menus.

import { rom } from "../rom";

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

const DIGIT_0 = 0xa1;

/** ConvertIntToDecimalStringN from string_util.c */
export function intToDecimal(value: number, mode = STR_CONV_MODE_LEFT_ALIGN, digits = 0): GbaString {
  let text = Math.max(0, Math.floor(value)).toString();
  if (digits > 0) {
    if (text.length > digits) text = text.slice(text.length - digits);
    if (mode === STR_CONV_MODE_LEADING_ZEROS) text = text.padStart(digits, "0");
    else if (mode === STR_CONV_MODE_RIGHT_ALIGN) text = text.padStart(digits, " ");
  }
  const out: number[] = [];
  for (const c of text) out.push(c === " " ? CHAR_SPACE : DIGIT_0 + Number(c));
  out.push(EOS);
  return Uint8Array.from(out);
}

export function countDigits(value: number): number {
  return Math.max(1, Math.floor(Math.abs(value)).toString().length);
}

/** Variables substituted by StringExpandPlaceholders. */
export const stringVars = {
  player: new Uint8Array([EOS]) as GbaString,
  rival: new Uint8Array([EOS]) as GbaString,
  var1: new Uint8Array([EOS]) as GbaString,
  var2: new Uint8Array([EOS]) as GbaString,
  var3: new Uint8Array([EOS]) as GbaString,
  var4: new Uint8Array([EOS]) as GbaString,
};

/** StringExpandPlaceholders: FD xx placeholders become the buffered strings. */
export function expandPlaceholders(src: ArrayLike<number>): GbaString {
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    if (b === EOS) break;
    if (b === PLACEHOLDER_BEGIN) {
      const id = src[++i];
      const value = placeholder(id);
      for (let j = 0; j < value.length && value[j] !== EOS; j++) out.push(value[j]);
      continue;
    }
    if (b === EXT_CTRL_CODE_BEGIN) {
      const n = extCtrlCodeLength(src[i + 1]);
      out.push(b);
      for (let j = 1; j <= n; j++) out.push(src[i + j]);
      i += n;
      continue;
    }
    out.push(b);
  }
  out.push(EOS);
  return Uint8Array.from(out);
}

function placeholder(id: number): ArrayLike<number> {
  switch (id) {
    case 0x01: return stringVars.player;
    case 0x02: return stringVars.var1;
    case 0x03: return stringVars.var2;
    case 0x04: return stringVars.var3;
    case 0x05: return []; // KUN (JP honorific)
    case 0x06: return stringVars.rival;
    case 0x07: return encode("FIRERED", false);
    case 0x08: return encode("MAGMA", false);
    case 0x09: return encode("AQUA", false);
    case 0x0a: return encode("MAXIE", false);
    case 0x0b: return encode("ARCHIE", false);
    case 0x0c: return encode("GROUDON", false);
    case 0x0d: return encode("KYOGRE", false);
    default: return [];
  }
}
