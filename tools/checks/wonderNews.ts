// Headless check for wonder_news.c (Wonder News reward tracking and distribution).
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants.ts";
import { flagClear, flagSet, GetVarPointer, save, varGet, varSet } from "../../src/fr/save.ts";
import {
  WonderNews_SetReward,
  WonderNews_Reset,
  WonderNews_IncrementStepCounter,
  WonderNews_GetRewardInfo,
  GetRewardItem,
  ResetSentRewardCounter,
  IncrementSentRewardCounter,
  IncrementRewardCounter,
  GetRewardType,
} from "../../src/fr/wonderNews.ts";
import {
  GetSavedWonderNewsMetadata,
  SaveWonderNews,
  ValidateSavedWonderNews,
  ValidateWonderNews,
  ClearSavedWonderNews,
  type WonderNews,
} from "../../src/fr/mysteryGift.ts";

console.log("Checking wonder_news.c headless logic...");

// 1. Reset Wonder News state
WonderNews_Reset();
const meta = GetSavedWonderNewsMetadata();
assert.equal(meta.newsType, C.WONDER_NEWS_NONE);
assert.equal(meta.sentRewardCounter, 0);
assert.equal(meta.rewardCounter, 0);
assert.equal(meta.berry, 0);
assert.equal(varGet(C.VAR_WONDER_NEWS_STEP_COUNTER), 0);

// 2. SetReward: received from friend or wireless gives berries between Razz (148) and Nomel (162)
// In berry indices: Razz = 16, Nomel = 30.
for (let i = 0; i < 20; i++) {
  WonderNews_SetReward(C.WONDER_NEWS_RECV_FRIEND);
  assert.equal(meta.newsType, C.WONDER_NEWS_RECV_FRIEND);
  assert.ok(meta.berry >= 16 && meta.berry <= 30, `Berry index ${meta.berry} within Razz..Nomel range`);

  WonderNews_SetReward(C.WONDER_NEWS_RECV_WIRELESS);
  assert.equal(meta.newsType, C.WONDER_NEWS_RECV_WIRELESS);
  assert.ok(meta.berry >= 16 && meta.berry <= 30, `Berry index ${meta.berry} within Razz..Nomel range`);
}

// SetReward: sent to partner gives berries between Cheri (133) and Iapapa (147)
// In berry indices: Cheri = 1, Iapapa = 15.
for (let i = 0; i < 20; i++) {
  WonderNews_SetReward(C.WONDER_NEWS_SENT);
  assert.equal(meta.newsType, C.WONDER_NEWS_SENT);
  assert.ok(meta.berry >= 1 && meta.berry <= 15, `Berry index ${meta.berry} within Cheri..Iapapa range`);
}

// 3. Step counter increment when at reward limit (5 rewards)
WonderNews_Reset();
assert.equal(meta.rewardCounter, 0);
// Below limit: steps are ignored by WonderNews_IncrementStepCounter
WonderNews_IncrementStepCounter();
assert.equal(varGet(C.VAR_WONDER_NEWS_STEP_COUNTER), 0);

meta.rewardCounter = 5;
for (let step = 1; step < 500; step++) {
  WonderNews_IncrementStepCounter();
  assert.equal(varGet(C.VAR_WONDER_NEWS_STEP_COUNTER), step);
  assert.equal(meta.rewardCounter, 5);
}
// 500th step resets both rewardCounter and the step counter variable
WonderNews_IncrementStepCounter();
assert.equal(varGet(C.VAR_WONDER_NEWS_STEP_COUNTER), 0);
assert.equal(meta.rewardCounter, 0);

// 4. Counter helper routines
IncrementRewardCounter(meta);
assert.equal(meta.rewardCounter, 1);
for (let i = 0; i < 10; i++) IncrementRewardCounter(meta);
assert.equal(meta.rewardCounter, 5, "rewardCounter caps at MAX_REWARD (5)");

IncrementSentRewardCounter(meta);
assert.equal(meta.sentRewardCounter, 1);
for (let i = 0; i < 10; i++) IncrementSentRewardCounter(meta);
assert.equal(meta.sentRewardCounter, 4, "sentRewardCounter caps at MAX_SENT_REWARD (4)");

ResetSentRewardCounter(meta);
assert.equal(meta.sentRewardCounter, 0, "ResetSentRewardCounter resets to 0");

// 5. GetRewardItem conversion from berry index to item ID
meta.berry = 1; // Cheri berry index
const itemCheri = GetRewardItem(meta);
assert.equal(itemCheri, C.ITEM_CHERI_BERRY);
assert.equal(meta.berry, 0);
assert.equal(meta.newsType, C.WONDER_NEWS_NONE);

meta.berry = 16; // Razz berry index
const itemRazz = GetRewardItem(meta);
assert.equal(itemRazz, C.ITEM_RAZZ_BERRY);
assert.equal(meta.berry, 0);

// 6. GetRewardType classification
WonderNews_Reset();
assert.equal(GetRewardType(meta), C.NEWS_REWARD_WAITING);

meta.newsType = C.WONDER_NEWS_RECV_FRIEND;
assert.equal(GetRewardType(meta), C.NEWS_REWARD_RECV_SMALL);

meta.newsType = C.WONDER_NEWS_RECV_WIRELESS;
assert.equal(GetRewardType(meta), C.NEWS_REWARD_RECV_BIG);

meta.newsType = C.WONDER_NEWS_SENT;
meta.sentRewardCounter = 0;
assert.equal(GetRewardType(meta), C.NEWS_REWARD_SENT_SMALL);
meta.sentRewardCounter = 2;
assert.equal(GetRewardType(meta), C.NEWS_REWARD_SENT_SMALL);
meta.sentRewardCounter = 3;
assert.equal(GetRewardType(meta), C.NEWS_REWARD_SENT_BIG);

meta.rewardCounter = 5;
assert.equal(GetRewardType(meta), C.NEWS_REWARD_AT_MAX);

// 7. Wonder News saving and CRC validation
const sampleNews: WonderNews = {
  id: 101,
  sendType: C.SEND_TYPE_ALLOWED,
  bgType: 0,
  titleText: [1, 2, 3, 0xff],
  bodyText: [[4, 5, 0xff]],
};
assert.equal(ValidateWonderNews(sampleNews), true);
assert.equal(ValidateWonderNews({ ...sampleNews, id: 0 }), false);

ClearSavedWonderNews();
assert.equal(ValidateSavedWonderNews(), false);

SaveWonderNews(sampleNews);
assert.equal(ValidateSavedWonderNews(), true);

// Tampering with CRC invalidates
save.wonderNewsCrc = 0x1234;
assert.equal(ValidateSavedWonderNews(), false);

// Resave cleanly
SaveWonderNews(sampleNews);
assert.equal(ValidateSavedWonderNews(), true);

// 8. WonderNews_GetRewardInfo integration
// When Mystery Gift is disabled, returns NEWS_REWARD_NONE
flagClear(C.FLAG_SYS_MYSTERY_GIFT_ENABLED);
assert.equal(WonderNews_GetRewardInfo(), C.NEWS_REWARD_NONE);

// PREPARED: Enable mystery gift flag to test reward info distribution
flagSet(C.FLAG_SYS_MYSTERY_GIFT_ENABLED);
console.log("PREPARED: Enabled FLAG_SYS_MYSTERY_GIFT_ENABLED for reward distribution check");

WonderNews_Reset();
assert.equal(WonderNews_GetRewardInfo(), C.NEWS_REWARD_WAITING);

// Test receiving friend news reward
WonderNews_SetReward(C.WONDER_NEWS_RECV_FRIEND);
const reward1 = WonderNews_GetRewardInfo();
assert.equal(reward1, C.NEWS_REWARD_RECV_SMALL);
const rewardedItem1 = varGet(C.VAR_RESULT);
assert.ok(rewardedItem1 >= C.ITEM_RAZZ_BERRY && rewardedItem1 <= C.ITEM_NOMEL_BERRY);
assert.equal(meta.rewardCounter, 1);

// Test sent news small vs big rewards
meta.rewardCounter = 0;
WonderNews_SetReward(C.WONDER_NEWS_SENT);
meta.sentRewardCounter = 2;
const rewardSentSmall = WonderNews_GetRewardInfo();
assert.equal(rewardSentSmall, C.NEWS_REWARD_SENT_SMALL);
assert.equal(meta.sentRewardCounter, 3);

// 4th sent reward is big reward and resets sentRewardCounter
WonderNews_SetReward(C.WONDER_NEWS_SENT);
assert.equal(meta.sentRewardCounter, 3);
const rewardSentBig = WonderNews_GetRewardInfo();
assert.equal(rewardSentBig, C.NEWS_REWARD_SENT_BIG);
assert.equal(meta.sentRewardCounter, 0);

// Cap at MAX_REWARD
meta.rewardCounter = 5;
assert.equal(WonderNews_GetRewardInfo(), C.NEWS_REWARD_AT_MAX);

console.log("wonder_news.c headless check passed successfully.");
