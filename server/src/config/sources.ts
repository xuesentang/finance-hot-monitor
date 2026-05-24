import type { SourceName, SourceType } from '../types.js';

interface SourceMeta {
  pollIntervalMin: number;
  rateLimitPerSec?: number;
  rateLimitPerHour?: number;
  timeout: number;
  sourceType: SourceType;
}

export const SOURCE_CONFIG: Record<SourceName, SourceMeta> = {
  sec_edgar:   { pollIntervalMin: 10, rateLimitPerSec: 10,  timeout: 15000, sourceType: 'announcement' },
  fred:        { pollIntervalMin: 60, rateLimitPerHour: 60, timeout: 15000, sourceType: 'macro_data' },
  nbs:         { pollIntervalMin: 60, rateLimitPerSec: 0.5, timeout: 15000, sourceType: 'macro_data' },
  juchao:      { pollIntervalMin: 10, rateLimitPerSec: 0.5, timeout: 15000, sourceType: 'announcement' },
  cailianshe:  { pollIntervalMin: 2,  rateLimitPerSec: 0.5, timeout: 10000, sourceType: 'news' },
  eastmoney:   { pollIntervalMin: 2,  rateLimitPerSec: 0.5, timeout: 10000, sourceType: 'news' },
};

// 信源权威排序：数字越小越权威
export const SOURCE_AUTHORITY: Record<SourceName, number> = {
  sec_edgar: 1,
  juchao: 2,
  cailianshe: 3,
  eastmoney: 4,
  fred: 5,
  nbs: 6,
};
