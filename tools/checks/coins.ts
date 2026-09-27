// Execute the C coins.c balance API against the browser save representation.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { GetCoins, SetCoins, addCoins, removeCoins, ApplyNewEncryptionKeyToBagItems, ApplyNewEncryptionKeyToBagItems_, GetBagItemQuantity } from "../../src/fr/pokemon/items.ts";
import { save } from "../../src/fr/save.ts";

SetCoins(0x10002);
assert.equal(GetCoins(), 2, "GetCoins and SetCoins use the C u16 value");
assert.equal(addCoins(0x10000), true, "a u16 zero addition succeeds below the cap");
assert.equal(GetCoins(), 2);
assert.equal(removeCoins(0x10001), true, "RemoveCoins narrows its u16 argument");
assert.equal(GetCoins(), 1);

SetCoins(9998);
assert.equal(addCoins(3), true);
assert.equal(GetCoins(), 9999, "AddCoins clamps to MAX_COINS");
assert.equal(addCoins(1), false, "AddCoins fails when already at MAX_COINS");
assert.equal(GetCoins(), 9999);
assert.equal(removeCoins(10000), false, "RemoveCoins leaves the balance on insufficient funds");
assert.equal(GetCoins(), 9999);

// The web save stores C's decrypted value directly.
assert.equal(save.coins, GetCoins());

// ApplyNewEncryptionKeyToBagItems & ApplyNewEncryptionKeyToBagItems_ (item.c)
save.bag.items.push({ item: 1, quantity: 5 });
ApplyNewEncryptionKeyToBagItems(0x12345678);
assert.equal(GetBagItemQuantity(save.bag.items[0]), 5, "ApplyNewEncryptionKeyToBagItems preserves logical quantity");
ApplyNewEncryptionKeyToBagItems_(0x87654321);
assert.equal(GetBagItemQuantity(save.bag.items[0]), 5, "ApplyNewEncryptionKeyToBagItems_ preserves logical quantity");
save.bag.items.length = 0;

console.log("✓ coins.c and item.c encryption key re-keying operations verified");
