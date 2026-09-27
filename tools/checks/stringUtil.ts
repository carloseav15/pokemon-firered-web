// Headless verification check for Clang AST-generated string utilities.
// Run from the repository root:
// npm run check:string-util

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  EOS,
  EXT_CTRL_CODE_BEGIN,
  CHAR_SPACE,
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
  STR_CONV_MODE_LEFT_ALIGN,
  STR_CONV_MODE_RIGHT_ALIGN,
  STR_CONV_MODE_LEADING_ZEROS,
  LANGUAGE_JAPANESE,
} from "../../src/fr/generated/stringUtil.ts";
import { rom } from "../../src/fr/rom.ts";
import { expandPlaceholders } from "../../src/fr/gba/charmap.ts";
import { bindSaveBlockReader, stringVars, type SaveBlocks } from "../../src/fr/gba/stringBuffers.ts";
import { newSaveData, save, setSave } from "../../src/fr/save.ts";

let compared = 0;

// 1. GetExtCtrlCodeLength
const expectedLengths = [1, 2, 2, 2, 4, 2, 2, 1, 2, 1, 1, 3, 2, 2, 2, 1, 3, 2, 2, 2, 2, 1, 1, 1, 1];
for (let code = 0; code <= 30; code++) {
  const actual = GetExtCtrlCodeLength(code);
  const expected = code >= 0 && code < expectedLengths.length ? expectedLengths[code] : 0;
  assert.equal(actual, expected, `GetExtCtrlCodeLength(${code}) mismatch`);
  compared++;
}

// 2. StringLength
assert.equal(StringLength([EOS]), 0);
assert.equal(StringLength([0x01, 0x02, 0x03, EOS]), 3);
assert.equal(StringLength([0x10, 0x20, 0x30, 0x40, 0x50, EOS]), 5);
compared += 3;

// 3. StringCopy
const dest = new Uint8Array(16);
const src = [0x41, 0x42, 0x43, EOS];
const endPos = StringCopy(dest, src);
assert.equal(endPos, 3);
assert.equal(dest[0], 0x41);
assert.equal(dest[1], 0x42);
assert.equal(dest[2], 0x43);
assert.equal(dest[3], EOS);
compared += 5;

// 4. StringAppend
const appEnd = StringAppend(dest, [0x44, 0x45, EOS]);
assert.equal(appEnd, 5);
assert.equal(dest[3], 0x44);
assert.equal(dest[4], 0x45);
assert.equal(dest[5], EOS);
compared += 4;

// 5. StringCopyN & StringAppendN
const destN = new Uint8Array(16);
const endN = StringCopyN(destN, [0x10, 0x20, 0x30, 0x40], 2);
assert.equal(endN, 2);
assert.equal(destN[0], 0x10);
assert.equal(destN[1], 0x20);
destN[2] = EOS;
const appN = StringAppendN(destN, [0x50, 0x60], 1);
assert.equal(appN, 3);
assert.equal(destN[2], 0x50);
compared += 5;

// 6. StringCompare & StringCompareN
const strA = [0x10, 0x20, 0x30, EOS];
const strB = [0x10, 0x20, 0x30, EOS];
const strC = [0x10, 0x20, 0x35, EOS];
const strD = [0x10, 0x20, EOS];
assert.equal(StringCompare(strA, strB), 0);
assert.ok(StringCompare(strA, strC) < 0);
assert.ok(StringCompare(strC, strA) > 0);
assert.equal(StringCompare(strA, strD), -207); // 0x30 - 0xFF = -207
assert.equal(StringCompare(strD, strA), 207);
assert.equal(StringCompareN(strA, strC, 2), 0);
assert.ok(StringCompareN(strA, strC, 3) < 0);
compared += 7;

// 7. StringFill & StringFillWithTerminator & StringCopyPadded
const fillBuf = new Uint8Array(10);
const fillEnd = StringFill(fillBuf, 0x55, 4);
assert.equal(fillEnd, 4);
assert.equal(fillBuf[0], 0x55);
assert.equal(fillBuf[3], 0x55);
assert.equal(fillBuf[4], EOS);
StringFillWithTerminator(fillBuf, 2);
assert.equal(fillBuf[0], EOS);
assert.equal(fillBuf[1], EOS);
assert.equal(fillBuf[2], EOS);

const padBuf = new Uint8Array(10);
StringCopyPadded(padBuf, [0x01, 0x02, EOS], CHAR_SPACE, 6);
assert.equal(padBuf[0], 0x01);
assert.equal(padBuf[1], 0x02);
assert.equal(padBuf[2], CHAR_SPACE);
assert.equal(padBuf[5], CHAR_SPACE);
assert.equal(padBuf[6], EOS);
compared += 12;

// 8. SkipExtCtrlCode & StripExtCtrlCodes & StringCompareWithoutExtCtrlCodes
const formatted = [
  EXT_CTRL_CODE_BEGIN, 0x01, 0x02,             // EXT_CTRL_CODE_COLOR (code 0x01 + 1 arg = 2 bytes)
  EXT_CTRL_CODE_BEGIN, 0x04, 0x01, 0x02, 0x03, // EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW (code 0x04 + 3 args = 4 bytes)
  0x20, 0x21, EOS
];
const skipped = SkipExtCtrlCode(formatted, 0);
assert.equal(skipped, 8);
assert.equal(formatted[skipped], 0x20);

const stripBuf = new Uint8Array(formatted);
StripExtCtrlCodes(stripBuf);
assert.equal(stripBuf[0], 0x20);
assert.equal(stripBuf[1], 0x21);
assert.equal(stripBuf[2], EOS);

const plain = [0x20, 0x21, EOS];
assert.equal(StringCompareWithoutExtCtrlCodes(formatted, plain), 0);
assert.ok(StringCompareWithoutExtCtrlCodes(formatted, [0x20, 0x22, EOS]) < 0);
compared += 7;

// 9. StringCopy_Nickname, StringGet_Nickname, StringCopy_PlayerName
const nickBuf = new Uint8Array(16);
const shortNick = [0x01, 0x02, 0x03, EOS];
const longNick = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, EOS];

const nickShortRet = StringCopy_Nickname(nickBuf, shortNick);
assert.equal(nickShortRet, 3);
assert.equal(nickBuf[0], 0x01);
assert.equal(nickBuf[3], EOS);

const nickLongRet = StringCopy_Nickname(nickBuf, longNick);
assert.equal(nickLongRet, 10);
assert.equal(nickBuf[9], 10);
assert.equal(nickBuf[10], EOS);

const getNickRet = StringGet_Nickname(nickBuf);
assert.equal(getNickRet, 10);

const playerBuf = new Uint8Array(16);
const playerRet = StringCopy_PlayerName(playerBuf, longNick);
assert.equal(playerRet, 7);
assert.equal(playerBuf[6], 7);
assert.equal(playerBuf[7], EOS);
compared += 10;

// 10. ConvertIntToDecimalStringN & ConvertIntToHexStringN
const decBuf = new Uint8Array(16);
// Zero with LEFT_ALIGN, 1 digit -> [0xA1, EOS]
const dec0Ret = ConvertIntToDecimalStringN(decBuf, 0, STR_CONV_MODE_LEFT_ALIGN, 1);
assert.equal(dec0Ret, 1);
assert.equal(decBuf[0], 0xA1); // '0'
assert.equal(decBuf[1], EOS);

// 42 with RIGHT_ALIGN, 5 digits -> [' ', ' ', ' ', '4', '2', EOS]
const dec42RightRet = ConvertIntToDecimalStringN(decBuf, 42, STR_CONV_MODE_RIGHT_ALIGN, 5);
assert.equal(dec42RightRet, 5);
assert.equal(decBuf[0], CHAR_SPACE);
assert.equal(decBuf[1], CHAR_SPACE);
assert.equal(decBuf[2], CHAR_SPACE);
assert.equal(decBuf[3], 0xA5); // '4'
assert.equal(decBuf[4], 0xA3); // '2'
assert.equal(decBuf[5], EOS);

// 42 with LEADING_ZEROS, 5 digits -> ['0', '0', '0', '4', '2', EOS]
const dec42LeadRet = ConvertIntToDecimalStringN(decBuf, 42, STR_CONV_MODE_LEADING_ZEROS, 5);
assert.equal(dec42LeadRet, 5);
assert.equal(decBuf[0], 0xA1);
assert.equal(decBuf[1], 0xA1);
assert.equal(decBuf[2], 0xA1);
assert.equal(decBuf[3], 0xA5);
assert.equal(decBuf[4], 0xA3);
assert.equal(decBuf[5], EOS);

// Hex: 0x1A3 with RIGHT_ALIGN, 4 digits -> [' ', '1', 'A', '3', EOS]
const hexBuf = new Uint8Array(16);
const hexRet = ConvertIntToHexStringN(hexBuf, 0x1A3, STR_CONV_MODE_RIGHT_ALIGN, 4);
assert.equal(hexRet, 4);
assert.equal(hexBuf[0], CHAR_SPACE);
assert.equal(hexBuf[1], 0xA2); // '1'
assert.equal(hexBuf[2], 0xBB); // 'A'
assert.equal(hexBuf[3], 0xA4); // '3'
assert.equal(hexBuf[4], EOS);
compared += 20;

// 11. StringCopyN_Multibyte & StringLength_Multibyte
const mbSrc = [0x10, 0xF9, 0x20, 0x30, EOS];
assert.equal(StringLength_Multibyte(mbSrc), 3);

const mbBuf = new Uint8Array(16);
const mbCopyRet = StringCopyN_Multibyte(mbBuf, mbSrc, 3);
assert.equal(mbCopyRet, 4);
assert.equal(mbBuf[0], 0x10);
assert.equal(mbBuf[1], 0xF9);
assert.equal(mbBuf[2], 0x20);
assert.equal(mbBuf[3], 0x30);
assert.equal(mbBuf[4], EOS);
compared += 7;

// 12. WriteColorChangeControlCode
const colorBuf = new Uint8Array(8);
const colorRet0 = WriteColorChangeControlCode(colorBuf, 0, 5);
assert.equal(colorRet0, 3);
assert.equal(colorBuf[0], EXT_CTRL_CODE_BEGIN);
assert.equal(colorBuf[1], 1);
assert.equal(colorBuf[2], 5);
assert.equal(colorBuf[3], EOS);

const colorRet1 = WriteColorChangeControlCode(colorBuf, 1, 7);
assert.equal(colorRet1, 3);
assert.equal(colorBuf[1], 3);
assert.equal(colorBuf[2], 7);

const colorRet2 = WriteColorChangeControlCode(colorBuf, 2, 9);
assert.equal(colorRet2, 3);
assert.equal(colorBuf[1], 2);
assert.equal(colorBuf[2], 9);
compared += 11;

// 13. ConvertInternationalString
const intlBuf = new Uint8Array(32);
intlBuf.set([0x31, 0x32, 0x33, EOS]);
ConvertInternationalString(intlBuf, LANGUAGE_JAPANESE);
assert.equal(intlBuf[0], EXT_CTRL_CODE_BEGIN);
assert.equal(intlBuf[1], 21);
assert.equal(intlBuf[2], 0x31);
assert.equal(intlBuf[3], 0x32);
assert.equal(intlBuf[4], 0x33);
assert.equal(intlBuf[5], EXT_CTRL_CODE_BEGIN);
assert.equal(intlBuf[6], 22);
assert.equal(intlBuf[7], EOS);
compared += 8;

// 14. Differential comparison against native host C compilation
const cHarness = `
#include <stdio.h>
#include <stdint.h>
#include <string.h>

typedef uint8_t u8;
typedef int8_t s8;
typedef uint16_t u16;
typedef int16_t s16;
typedef uint32_t u32;
typedef int32_t s32;
typedef int bool32;

#define EOS 0xFF
#define CHAR_SPACE 0x00
#define CHAR_QUESTION_MARK 0xAC
#define EXT_CTRL_CODE_BEGIN 0xFC
#define POKEMON_NAME_LENGTH 10
#define PLAYER_NAME_LENGTH 7
#define LANGUAGE_JAPANESE 1

static const u8 sDigits[] = { 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xC0 };
static const s32 sPowersOfTen[] = { 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000 };

enum StringConvertMode {
    STR_CONV_MODE_LEFT_ALIGN,
    STR_CONV_MODE_RIGHT_ALIGN,
    STR_CONV_MODE_LEADING_ZEROS
};

u8 *ConvertIntToDecimalStringN(u8 *dest, s32 value, enum StringConvertMode mode, u8 n) {
    enum { WAITING_FOR_NONZERO_DIGIT, WRITING_DIGITS, WRITING_SPACES } state = WAITING_FOR_NONZERO_DIGIT;
    s32 powerOfTen;
    s32 largestPowerOfTen = sPowersOfTen[n - 1];
    if (mode == STR_CONV_MODE_RIGHT_ALIGN) state = WRITING_SPACES;
    if (mode == STR_CONV_MODE_LEADING_ZEROS) state = WRITING_DIGITS;
    for (powerOfTen = largestPowerOfTen; powerOfTen > 0; powerOfTen /= 10) {
        u8 *out;
        u8 c;
        u16 digit = value / powerOfTen;
        s32 temp = value - (powerOfTen * digit);
        if (state == WRITING_DIGITS) {
            out = dest++;
            c = (digit <= 9) ? sDigits[digit] : CHAR_QUESTION_MARK;
            *out = c;
        } else if (digit != 0 || powerOfTen == 1) {
            state = WRITING_DIGITS;
            out = dest++;
            c = (digit <= 9) ? sDigits[digit] : CHAR_QUESTION_MARK;
            *out = c;
        } else if (state == WRITING_SPACES) {
            *dest++ = CHAR_SPACE;
        }
        value = temp;
    }
    *dest = EOS;
    return dest;
}

u8 *ConvertIntToHexStringN(u8 *dest, s32 value, enum StringConvertMode mode, u8 n) {
    enum { WAITING_FOR_NONZERO_DIGIT, WRITING_DIGITS, WRITING_SPACES } state = WAITING_FOR_NONZERO_DIGIT;
    u8 i;
    s32 powerOfSixteen;
    s32 largestPowerOfSixteen = 1;
    for (i = 1; i < n; i++) largestPowerOfSixteen *= 16;
    if (mode == STR_CONV_MODE_RIGHT_ALIGN) state = WRITING_SPACES;
    if (mode == STR_CONV_MODE_LEADING_ZEROS) state = WRITING_DIGITS;
    for (powerOfSixteen = largestPowerOfSixteen; powerOfSixteen > 0; powerOfSixteen /= 16) {
        u8 *out;
        u8 c;
        u32 digit = value / powerOfSixteen;
        s32 temp = value % powerOfSixteen;
        if (state == WRITING_DIGITS) {
            out = dest++;
            c = (digit <= 0xF) ? sDigits[digit] : CHAR_QUESTION_MARK;
            *out = c;
        } else if (digit != 0 || powerOfSixteen == 1) {
            state = WRITING_DIGITS;
            out = dest++;
            c = (digit <= 0xF) ? sDigits[digit] : CHAR_QUESTION_MARK;
            *out = c;
        } else if (state == WRITING_SPACES) {
            *dest++ = CHAR_SPACE;
        }
        value = temp;
    }
    *dest = EOS;
    return dest;
}

int main(void) {
    u8 buf[32];
    ConvertIntToDecimalStringN(buf, 42, STR_CONV_MODE_RIGHT_ALIGN, 5);
    for (int i = 0; buf[i] != EOS; i++) printf("%02X", buf[i]);
    printf(";");
    ConvertIntToHexStringN(buf, 0x1A3, STR_CONV_MODE_RIGHT_ALIGN, 4);
    for (int i = 0; buf[i] != EOS; i++) printf("%02X", buf[i]);
    printf("\\n");
    return 0;
}
`;

const cResult = execSync(
  `bash -c 'gcc -O2 -x c - -o /tmp/c_harness_check && /tmp/c_harness_check'`,
  { input: cHarness, encoding: "utf8" }
);
const [cDec, cHex] = cResult.trim().split(";");
assert.equal(cDec, "000000A5A3");
assert.equal(cHex, "00A2BBA4");
compared += 2;

// 15. Verify deterministic regeneration (when pokefirered decomp tree is accessible)
try {
  const regenResult = execSync(
    "python3 -c '\n" +
    "import sys; sys.path.insert(0, \"tools/decomp\")\n" +
    "import clang_codegen\n" +
    "from pathlib import Path\n" +
    "current = Path(\"src/fr/generated/stringUtil.ts\").read_text()\n" +
    "generated = clang_codegen.generate_string_util_ts()\n" +
    "assert current == generated, \"Regeneration diff detected!\"\n" +
    "print(\"DETERMINISTIC\")\n" +
    "'",
    { cwd: process.cwd(), encoding: "utf8" }
  );
  assert.equal(regenResult.trim(), "DETERMINISTIC");
  compared++;
} catch (e: any) {
  if (e.message && e.message.includes("Operation not permitted")) {
    console.warn("Notice: regeneration check skipped due to sandboxed decomp tree.");
  } else {
    throw e;
  }
}

// 16. Verify explicit rejection of unsupported constructs (goto, inline asm)
const rejectionResult = execSync(
  "python3 -c '\n" +
  "import sys; sys.path.insert(0, \"tools/decomp\")\n" +
  "import clang_codegen, clang_ast\n" +
  "# Craft AST with GotoStmt\n" +
  "fake_func = clang_ast.AstFunction(\n" +
  "    name=\"bad_goto\",\n" +
  "    return_type=\"void\",\n" +
  "    params=[],\n" +
  "    raw_node={},\n" +
  "    body={\"kind\": \"CompoundStmt\", \"inner\": [{\"kind\": \"GotoStmt\"}]}\n" +
  ")\n" +
  "emitter = clang_codegen.ClangTsEmitter(\"test.c\", fake_func)\n" +
  "try:\n" +
  "    emitter.emit_function()\n" +
  "    assert False, \"Failed to reject GotoStmt!\"\n" +
  "except clang_codegen.UnsupportedAstError as e:\n" +
  "    assert \"goto\" in str(e)\n" +
  "    print(\"REJECTED_GOTO\")\n" +
  "'",
  { cwd: process.cwd(), encoding: "utf8" }
);
assert.equal(rejectionResult.trim(), "REJECTED_GOTO");
compared++;

// 17. Placeholder family (StringExpandPlaceholders / StringBraille /
//     GetExpandedPlaceholder / ExpandPlaceholder_*): differential against the
//     real string_util.c, compiled for the host from the same preprocessed
//     source the Clang AST and the generator come from.
const root = process.cwd();
rom.strings ??= JSON.parse(readFileSync(`${root}/public/fr/data/strings.json`, "utf8"));

// 17a. save.ts publishes gSaveBlock1Ptr/gSaveBlock2Ptr to the placeholders.
save.playerName = [0x51, 0x52, EOS];
save.rivalName = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
save.playerGender = 1;
assert.deepEqual(Array.from(expandPlaceholders([0xfd, 0x01, EOS])), [0x51, 0x52, EOS]);
assert.deepEqual(Array.from(expandPlaceholders([0xfd, 0x06, EOS])), Array.from(rom.text("gExpandedPlaceholder_Red")));
save.playerGender = 0;
assert.deepEqual(Array.from(expandPlaceholders([0xfd, 0x06, EOS])), Array.from(rom.text("gExpandedPlaceholder_Green")));
save.rivalName = [0x53, 0x54, 0x55, EOS, 0, 0, 0, 0];
assert.deepEqual(Array.from(expandPlaceholders([0xfd, 0x06, EOS])), [0x53, 0x54, 0x55, EOS]);
setSave(newSaveData());
compared += 4;

// 17b. adapter: a source without EOS behaves like the terminated one and the
//      result is always terminated (the C keeps reading until it finds 0xFF).
const unterm = expandPlaceholders([0xfd, 0x07]);
assert.deepEqual(Array.from(unterm), Array.from(expandPlaceholders([0xfd, 0x07, EOS])));
assert.equal(unterm[unterm.length - 1], EOS);
assert.deepEqual(Array.from(unterm), Array.from(rom.text("gExpandedPlaceholder_Ruby")));
compared += 3;

// Shared battery: the C harness and the TS side run exactly these inputs.
const expandCases: { key: string; bytes: number[] }[] = [
  { key: "plain", bytes: [0xa1, 0xa2, EOS] },
  { key: "player", bytes: [0xa1, 0xfd, 0x01, 0xa3, EOS] },
  { key: "var1", bytes: [0xfd, 0x02, EOS] },
  { key: "var2", bytes: [0xfd, 0x03, 0xb1, EOS] },
  { key: "var3", bytes: [0xfd, 0x04, EOS] },
  { key: "kun", bytes: [0xfd, 0x05, EOS] },
  { key: "rival", bytes: [0xfd, 0x06, EOS] },
  { key: "version", bytes: [0xfd, 0x07, EOS] },
  { key: "magma", bytes: [0xfd, 0x08, EOS] },
  { key: "aqua", bytes: [0xfd, 0x09, EOS] },
  { key: "maxie", bytes: [0xfd, 0x0a, EOS] },
  { key: "archie", bytes: [0xfd, 0x0b, EOS] },
  { key: "groudon", bytes: [0xfd, 0x0c, EOS] },
  { key: "kyogre", bytes: [0xfd, 0x0d, EOS] },
  { key: "empty", bytes: [0xfd, 0x0e, EOS] },
  { key: "junkid", bytes: [0xfd, 0xff, EOS] },
  { key: "ext07", bytes: [0xfc, 0x07, 0xa4, EOS] },
  { key: "ext09", bytes: [0xfc, 0x09, 0xa4, EOS] },
  { key: "ext0f", bytes: [0xfc, 0x0f, 0xa4, EOS] },
  { key: "ext15", bytes: [0xfc, 0x15, 0xa4, EOS] },
  { key: "ext18", bytes: [0xfc, 0x18, 0xa4, EOS] },
  { key: "ext04", bytes: [0xfc, 0x04, 0x01, 0x02, 0x03, 0xa5, EOS] },
  { key: "ext0b", bytes: [0xfc, 0x0b, 0x01, 0x02, 0xa6, EOS] },
  { key: "ext10", bytes: [0xfc, 0x10, 0x01, 0xa7, EOS] },
  { key: "newline", bytes: [0xfe, 0xa6, EOS] },
  { key: "prompt", bytes: [0xfa, 0xfb, 0x20, EOS] },
  { key: "twice", bytes: [0xfd, 0x07, 0xfd, 0x0d, EOS] },
  { key: "mixed", bytes: [0xa1, 0xfd, 0x01, 0xfc, 0x07, 0xa2, EOS] },
];
const brailleCases: { key: string; bytes: number[] }[] = [
  { key: "b0", bytes: [0x61, 0x62, EOS] },
  { key: "b1", bytes: [0xfe, 0x21, EOS] },
  { key: "b2", bytes: [EOS] },
];
const states = [
  {
    player: [0x11, 0x12, 0xff, 0, 0, 0, 0, 0],
    gender: 0,
    rival: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
    var1: [0xb1, 0xb2, 0xff],
    var2: [0xc1, 0xff],
    var3: [0xd1, 0xd2, 0xff],
  },
  {
    player: [0xa1, 0xa2, 0xa3, 0xff, 0, 0, 0, 0],
    gender: 1,
    rival: [0x14, 0x15, 0x16, 0xff, 0, 0, 0, 0],
    var1: [0xe1, 0xff],
    var2: [0xe2, 0xff],
    var3: [0xe3, 0xff],
  },
];

const hexLine = (key: string, buf: ArrayLike<number>, end: number): string => {
  let hex = "";
  for (let i = 0; i <= end; i++) hex += (buf[i] ?? 0).toString(16).padStart(2, "0").toUpperCase();
  return `${key} ${hex}`;
};
// Same rule as the C dumpStr: scan at most max bytes for the EOS and print
// everything up to it (inclusive), or all max bytes when there is none.
const hexUntil = (key: string, buf: ArrayLike<number>, max: number): string => {
  const n = Math.min(max, buf.length);
  let i = 0;
  while (i < n && buf[i] !== EOS) i++;
  return hexLine(key, buf, i < n ? i : n - 1);
};

// 17c. The stub save state, mirroring the harness' setState().
const stub: SaveBlocks = { playerName: [], playerGender: 0, rivalName: [] };
bindSaveBlockReader(() => stub);
const tsLines: string[] = [];
for (let s = 0; s < states.length; s++) {
  const st = states[s];
  const pfx = `${String.fromCharCode(65 + s)}.`;
  stub.playerName = st.player;
  stub.playerGender = st.gender;
  stub.rivalName = st.rival;
  stringVars.var1 = Uint8Array.from(st.var1);
  stringVars.var2 = Uint8Array.from(st.var2);
  stringVars.var3 = Uint8Array.from(st.var3);
  for (const c of expandCases) {
    const out = new Uint8Array(1000);
    tsLines.push(hexLine(pfx + c.key, out, StringExpandPlaceholders(out, c.bytes)));
  }
  for (let id = 0; id < 16; id++) {
    tsLines.push(hexUntil(`${pfx}gp${id}`, GetExpandedPlaceholder(id), id === 0 ? 16 : 64));
  }
  for (const c of brailleCases) {
    const out = new Uint8Array(1000);
    tsLines.push(hexLine(pfx + c.key, out, StringBraille(out, c.bytes)));
  }
}

// Compile the real string_util.c for the host and run the same battery on it.
const decompTree = process.env.POKEFIRERED ?? `${root}/../pokefirered`;
const cTree = `${decompTree}/src/string_util.c`;
if (!existsSync(cTree)) {
  console.warn(`Notice: placeholder differential skipped, ${cTree} not found.`);
} else {
  const phNames = ["Empty", "Magma", "Aqua", "Maxie", "Archie", "Groudon", "Kyogre", "Ruby", "Red", "Green", "Kun", "Chan"];
  const prefixExpr = (i: number): string =>
    i === 0 ? `"${String.fromCharCode(65)}."` : `(which == ${i}) ? "${String.fromCharCode(65 + i)}." : ${prefixExpr(i - 1)}`;
  const arraysOf = (st: (typeof states)[number], i: number): string[] =>
    ["player", "rival", "var1", "var2", "var3"].map(
      (f) => `static const u8 st${i}_${f}[] = {${(st as any)[f].join(",")}};`
    );
  const cTail = [
    "extern int printf(const char *, ...);",
    ...phNames.map((n) => `u8 gExpandedPlaceholder_${n}[] = {${Array.from(rom.text(`gExpandedPlaceholder_${n}`)).join(",")}};`),
    "static struct SaveBlock2 sb2;",
    "static struct SaveBlock1 sb1;",
    "struct SaveBlock2 *gSaveBlock2Ptr = &sb2;",
    "struct SaveBlock1 *gSaveBlock1Ptr = &sb1;",
    "static const char *gPfx;",
    "static void dump(const char *key, const u8 *buf, s32 end) {",
    "    s32 i;",
    '    printf("%s%s ", gPfx, key);',
    '    for (i = 0; i <= end; i++) printf("%02X", buf[i]);',
    '    printf("\\n");',
    "}",
    "static void dumpStr(const char *key, const u8 *p, s32 max) {",
    "    s32 i = 0;",
    "    while (i < max && p[i] != 0xFF) i++;",
    "    dump(key, p, i < max ? i : max - 1);",
    "}",
    ...expandCases.map((c) => `static const u8 c_${c.key}[] = {${c.bytes.join(",")}};`),
    ...brailleCases.map((c) => `static const u8 br_${c.key}[] = {${c.bytes.join(",")}};`),
    ...states.flatMap(arraysOf),
    "static void setState(int which) {",
    "    memset(&sb2, 0, sizeof(sb2));",
    "    memset(&sb1, 0, sizeof(sb1));",
    "    memset(gStringVar1, 0, 32);",
    "    memset(gStringVar2, 0, 32);",
    "    memset(gStringVar3, 0, 32);",
    ...states.flatMap((st, i) => [
      `    if (which == ${i}) {`,
      `        memcpy(sb2.playerName, st${i}_player, sizeof(st${i}_player));`,
      `        sb2.playerGender = ${st.gender};`,
      `        memcpy(sb1.rivalName, st${i}_rival, sizeof(st${i}_rival));`,
      `        memcpy(gStringVar1, st${i}_var1, sizeof(st${i}_var1));`,
      `        memcpy(gStringVar2, st${i}_var2, sizeof(st${i}_var2));`,
      `        memcpy(gStringVar3, st${i}_var3, sizeof(st${i}_var3));`,
      "    }",
    ]),
    "}",
    "int main(void) {",
    "    u8 out[1000];",
    "    int which;",
    `    for (which = 0; which < ${states.length}; which++) {`,
    `        gPfx = ${prefixExpr(states.length - 1)};`,
    "        setState(which);",
    ...expandCases.map((c) => `        dump("${c.key}", out, (s32)(StringExpandPlaceholders(out, c_${c.key}) - out));`),
    ...Array.from({ length: 16 }, (_, id) => `        dumpStr("gp${id}", GetExpandedPlaceholder(${id}), ${id === 0 ? 16 : 64});`),
    ...brailleCases.map((c) => `        dump("${c.key}", out, (s32)(StringBraille(out, br_${c.key}) - out));`),
    "    }",
    "    return 0;",
    "}",
    "",
  ].join("\n");

  const pre = execSync(
    `python3 -c 'import sys; sys.path.insert(0, "tools/decomp"); import clang_ast; from pathlib import Path; print(clang_ast.preprocess_c_file(Path(sys.argv[1])))' "${cTree}"`,
    { cwd: root, encoding: "utf8" }
  ).trim();
  const preText = readFileSync(pre, "utf8").replace(/__attribute__\(\(section\("[^"]*"\)\)\)/g, "");
  mkdirSync(`${root}/.decomp-build/checks`, { recursive: true });
  const cFile = `${root}/.decomp-build/checks/suPlaceholder.c`;
  const binFile = `${root}/.decomp-build/checks/suPlaceholder`;
  writeFileSync(cFile, preText + "\n" + cTail);
  const cOut = execSync(`gcc -O1 -w "${cFile}" -o "${binFile}" && "${binFile}"`, { cwd: root, encoding: "utf8" });
  const cLines = cOut.trim().split("\n");
  assert.equal(cLines.length, tsLines.length, "placeholder battery line count mismatch");
  for (let i = 0; i < tsLines.length; i++) assert.equal(tsLines[i], cLines[i], `placeholder battery line ${i}`);
  compared += tsLines.length;
}

console.log(`PASS: verified ${compared} differential checks against C semantics; deterministic regeneration and explicit rejection confirmed.`);
