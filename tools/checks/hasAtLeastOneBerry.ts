// Headless comparison for HasAtLeastOneBerry (item.c) and its special-var side effect.
// PREPARED: bag key items and berry-pouch slots are constructed directly for each input.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/fr/generated/constants.ts";
import { HasAtLeastOneBerry } from "../../src/fr/pokemon/items.ts";
import { rom } from "../../src/fr/rom.ts";
import { save, SV, varGet } from "../../src/fr/save.ts";

rom.items = JSON.parse(readFileSync(`${process.cwd()}/public/fr/data/items.json`, "utf8")).items;
const keyItems = save.bag.keyItems;
const berries = save.bag.berryPouch;
keyItems.length = 0;
berries.length = 0;

// The C requires both the Berry Pouch key item and at least one item in the berry ID range.
berries.push({ item: C.ITEM_CHERI_BERRY, quantity: 1 });
assert.equal(HasAtLeastOneBerry(), 0, "a berry without the Berry Pouch does not qualify");
assert.equal(varGet(SV.RESULT), 0, "false result is written to VAR_RESULT");

keyItems.push({ item: C.ITEM_BERRY_POUCH, quantity: 1 });
berries.length = 0;
assert.equal(HasAtLeastOneBerry(), 0, "the Berry Pouch without a berry does not qualify");

berries.push({ item: C.ITEM_CHERI_BERRY - 1, quantity: 1 });
assert.equal(HasAtLeastOneBerry(), 0, "an item outside the berry ID range does not qualify");

berries.splice(0, berries.length, { item: C.ITEM_CHERI_BERRY, quantity: 1 });
assert.equal(HasAtLeastOneBerry(), 1, "a pouch and a berry qualify");
assert.equal(varGet(SV.RESULT), 1, "true result is written to VAR_RESULT");

console.log("PASS: HasAtLeastOneBerry checks Berry Pouch ownership, source berry range, and VAR_RESULT (PREPARED state)");
