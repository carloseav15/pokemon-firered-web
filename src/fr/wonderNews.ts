// wonder_news.c: Wonder News rewards (berries from the Berry Man in Cerulean City House 4).

import * as C from "./generated/constants";
import { random } from "./random";
import { GetVarPointer, IsMysteryGiftEnabled, VarSet } from "./save";
import { GetSavedWonderNewsMetadata, ValidateSavedWonderNews, type WonderNewsMetadata } from "./mysteryGift";

// Every 4th reward for sending Wonder News to a link partner is a "big" reward.
const MAX_SENT_REWARD = 4;

// Only up to 5 rewards can be received in a short period. After this the player
// must take 500 steps before any more rewards can be received.
const MAX_REWARD = 5;

const FIRST_BERRY_INDEX = C.ITEM_CHERI_BERRY;

function ITEM_TO_BERRY(itemId: number): number {
  return itemId - FIRST_BERRY_INDEX + 1;
}

export function WonderNews_SetReward(newsType: number): void {
  const data = GetSavedWonderNewsMetadata();

  data.newsType = newsType & 3;
  switch (newsType) {
    case C.WONDER_NEWS_NONE:
      break;
    case C.WONDER_NEWS_RECV_FRIEND:
    case C.WONDER_NEWS_RECV_WIRELESS:
      // Random berry between ITEM_RAZZ_BERRY and ITEM_NOMEL_BERRY
      data.berry = ((random() % 15) + ITEM_TO_BERRY(C.ITEM_RAZZ_BERRY)) & 0xff;
      break;
    case C.WONDER_NEWS_SENT:
      // Random berry between ITEM_CHERI_BERRY and ITEM_IAPAPA_BERRY
      data.berry = ((random() % 15) + ITEM_TO_BERRY(C.ITEM_CHERI_BERRY)) & 0xff;
      break;
  }
}

export function WonderNews_Reset(): void {
  const data = GetSavedWonderNewsMetadata();

  data.newsType = C.WONDER_NEWS_NONE;
  data.sentRewardCounter = 0;
  data.rewardCounter = 0;
  data.berry = 0;
  VarSet(C.VAR_WONDER_NEWS_STEP_COUNTER, 0);
}

export function WonderNews_IncrementStepCounter(): void {
  const stepCounter = GetVarPointer(C.VAR_WONDER_NEWS_STEP_COUNTER);
  const data = GetSavedWonderNewsMetadata();

  // If the player has reached the reward limit, start counting steps.
  // When they reach 500 steps reset the reward counter to allow them to
  // receive rewards again.
  if (data.rewardCounter >= MAX_REWARD) {
    const nextSteps = ((stepCounter ? stepCounter.value : 0) + 1) & 0xffff;
    if (stepCounter) stepCounter.value = nextSteps;
    if (nextSteps >= 500) {
      data.rewardCounter = 0;
      if (stepCounter) stepCounter.value = 0;
    }
  }
}

export function WonderNews_GetRewardInfo(): number {
  const result = GetVarPointer(C.VAR_RESULT);
  const data = GetSavedWonderNewsMetadata();

  if (!IsMysteryGiftEnabled() || !ValidateSavedWonderNews())
    return C.NEWS_REWARD_NONE;

  const rewardType = GetRewardType(data);

  switch (rewardType) {
    case C.NEWS_REWARD_RECV_SMALL:
    case C.NEWS_REWARD_RECV_BIG:
      if (result) result.value = GetRewardItem(data);
      break;
    case C.NEWS_REWARD_SENT_SMALL:
      if (result) result.value = GetRewardItem(data);
      IncrementSentRewardCounter(data);
      break;
    case C.NEWS_REWARD_SENT_BIG:
      if (result) result.value = GetRewardItem(data);
      ResetSentRewardCounter(data);
      break;
    case C.NEWS_REWARD_NONE:
    case C.NEWS_REWARD_WAITING:
    case C.NEWS_REWARD_AT_MAX:
      break;
  }

  return rewardType;
}

export function GetRewardItem(data: WonderNewsMetadata): number {
  data.newsType = C.WONDER_NEWS_NONE;
  const itemId = data.berry + FIRST_BERRY_INDEX - 1;
  data.berry = 0;
  IncrementRewardCounter(data);
  return itemId;
}

export function ResetSentRewardCounter(data: WonderNewsMetadata): void {
  data.sentRewardCounter = 0;
}

// Track number of times a reward was received (or attempted to receive) for sending Wonder News to a link partner.
export function IncrementSentRewardCounter(data: WonderNewsMetadata): void {
  data.sentRewardCounter++;
  if (data.sentRewardCounter > MAX_SENT_REWARD)
    data.sentRewardCounter = MAX_SENT_REWARD;
}

export function IncrementRewardCounter(data: WonderNewsMetadata): void {
  data.rewardCounter++;
  if (data.rewardCounter > MAX_REWARD)
    data.rewardCounter = MAX_REWARD;
}

export function GetRewardType(data: WonderNewsMetadata): number {
  if (data.rewardCounter === MAX_REWARD)
    return C.NEWS_REWARD_AT_MAX;

  switch (data.newsType) {
    case C.WONDER_NEWS_NONE:
      return C.NEWS_REWARD_WAITING;
    case C.WONDER_NEWS_RECV_FRIEND:
      return C.NEWS_REWARD_RECV_SMALL;
    case C.WONDER_NEWS_RECV_WIRELESS:
      return C.NEWS_REWARD_RECV_BIG;
    case C.WONDER_NEWS_SENT:
      if (data.sentRewardCounter < MAX_SENT_REWARD - 1)
        return C.NEWS_REWARD_SENT_SMALL;
      return C.NEWS_REWARD_SENT_BIG;
    default:
      return C.NEWS_REWARD_NONE;
  }
}
