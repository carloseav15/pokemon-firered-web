// mystery_gift.c: Wonder News and Wonder Card data access, CRC validation, and lifecycle.

import * as C from "./generated/constants";
import { save, type WonderNews, type WonderNewsMetadata } from "./save";
import { CalcCRC16WithTable } from "./util";

export { type WonderNews, type WonderNewsMetadata };

export function serializeWonderNews(news: WonderNews): Uint8Array {
  const buf = new Uint8Array(444);
  buf[0] = news.id & 0xff;
  buf[1] = (news.id >> 8) & 0xff;
  buf[2] = news.sendType & 0xff;
  buf[3] = news.bgType & 0xff;
  if (news.titleText) {
    for (let i = 0; i < C.WONDER_NEWS_TEXT_LENGTH && i < news.titleText.length; i++) {
      buf[4 + i] = news.titleText[i] & 0xff;
    }
  }
  if (news.bodyText) {
    for (let line = 0; line < C.WONDER_NEWS_BODY_TEXT_LINES && line < news.bodyText.length; line++) {
      const row = news.bodyText[line];
      if (row) {
        for (let i = 0; i < C.WONDER_NEWS_TEXT_LENGTH && i < row.length; i++) {
          buf[44 + line * 40 + i] = row[i] & 0xff;
        }
      }
    }
  }
  return buf;
}

export function GetSavedWonderNews(): WonderNews | undefined {
  return save.wonderNews;
}

export function GetSavedWonderNewsMetadata(): WonderNewsMetadata {
  if (!save.wonderNewsMetadata) {
    save.wonderNewsMetadata = { newsType: 0, sentRewardCounter: 0, rewardCounter: 0, berry: 0 };
  }
  return save.wonderNewsMetadata;
}

export function ClearSavedWonderNews(): void {
  save.wonderNews = undefined;
  save.wonderNewsCrc = 0;
}

export function ClearSavedWonderNewsAndRelated(): void {
  ClearSavedWonderNews();
}

export function ValidateWonderNews(news: WonderNews): boolean {
  if (news.id === 0) return false;
  return true;
}

export function ValidateSavedWonderNews(): boolean {
  if (!save.wonderNews) return false;
  const crc = CalcCRC16WithTable(serializeWonderNews(save.wonderNews), 444);
  if (crc !== (save.wonderNewsCrc ?? 0)) return false;
  if (!ValidateWonderNews(save.wonderNews)) return false;
  return true;
}

export function SaveWonderNews(news: WonderNews): boolean {
  if (!ValidateWonderNews(news)) return false;
  ClearSavedWonderNews();
  save.wonderNews = {
    id: news.id,
    sendType: news.sendType,
    bgType: news.bgType,
    titleText: [...news.titleText],
    bodyText: news.bodyText.map((line) => [...line]),
  };
  save.wonderNewsCrc = CalcCRC16WithTable(serializeWonderNews(save.wonderNews), 444);
  return true;
}

export function IsSendingSavedWonderNewsAllowed(): boolean {
  const news = save.wonderNews;
  if (!news || news.sendType === C.SEND_TYPE_DISALLOWED) return false;
  return true;
}
