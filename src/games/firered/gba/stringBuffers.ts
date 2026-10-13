// string_util.c: the EWRAM string buffers (gStringVar1..gStringVar4) and the
// SaveBlock fields the ExpandPlaceholder_* functions read.
//
// Leaf module: it imports nothing, so generated/stringUtil.ts can use it
// without an import cycle (save.ts -> gba/charmap.ts -> generated/stringUtil).

/** gStringVar1..gStringVar4. Callers assign fresh strings, as the C does with
 *  gStringVar* = ...; the buffers start as a lone EOS like the BSS does. */
export const stringVars: {
  var1: Uint8Array;
  var2: Uint8Array;
  var3: Uint8Array;
  var4: Uint8Array;
} = {
  var1: new Uint8Array([0xff]),
  var2: new Uint8Array([0xff]),
  var3: new Uint8Array([0xff]),
  var4: new Uint8Array([0xff]),
};

/** gStringVar4[1000]: the destination buffer of StringExpandPlaceholders. */
export const STRING_VAR4_LENGTH = 1000;

/** The fields of gSaveBlock1Ptr/gSaveBlock2Ptr the placeholders read. The web
 *  port keeps both save blocks in one object (save.ts), so one reader serves
 *  both pointers. */
export interface SaveBlocks {
  playerName: ArrayLike<number>;
  playerGender: number;
  rivalName: ArrayLike<number>;
}

let readSaveBlocks: (() => SaveBlocks) | null = null;

/** save.ts registers the live save state at module load, like the C keeps
 *  gSaveBlock1Ptr/gSaveBlock2Ptr pointing at the running save. */
export function bindSaveBlockReader(reader: () => SaveBlocks): void {
  readSaveBlocks = reader;
}

export function saveBlocks(): SaveBlocks {
  if (!readSaveBlocks) throw new Error("save block reader is not bound");
  return readSaveBlocks();
}
