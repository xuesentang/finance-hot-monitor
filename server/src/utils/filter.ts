import type { AIAnalysis, FilterResult, RawContent } from '../types.js';

type KeywordType = 'stock_code' | 'stock_name' | 'sector' | 'macro_indicator' | 'policy' | 'generic';

interface FilterThresholds {
  notSubstantialAndLowRel: number;
  lowRel: number;
  notMentionedAndRel: number;
}

const THRESHOLDS: Record<KeywordType, FilterThresholds> = {
  stock_code:      { notSubstantialAndLowRel: 20, lowRel: 25, notMentionedAndRel: 40 },
  stock_name:      { notSubstantialAndLowRel: 20, lowRel: 25, notMentionedAndRel: 40 },
  sector:          { notSubstantialAndLowRel: 15, lowRel: 20, notMentionedAndRel: 25 },
  macro_indicator: { notSubstantialAndLowRel: 15, lowRel: 20, notMentionedAndRel: 25 },
  policy:          { notSubstantialAndLowRel: 15, lowRel: 20, notMentionedAndRel: 25 },
  generic:         { notSubstantialAndLowRel: 20, lowRel: 25, notMentionedAndRel: 40 },
};

export function shouldFilter(
  item: RawContent,
  analysis: AIAnalysis,
  keywordType: KeywordType = 'generic'
): FilterResult {
  const t = THRESHOLDS[keywordType] || THRESHOLDS.generic;

  if (!analysis.isSubstantial && analysis.relevance < t.notSubstantialAndLowRel) {
    return { pass: false, reason: 'not-substantial-low-relevance' };
  }
  if (analysis.relevance < t.lowRel) {
    return { pass: false, reason: 'low-relevance' };
  }
  if (!analysis.keywordMentioned && analysis.relevance < t.notMentionedAndRel) {
    return { pass: false, reason: 'not-mentioned-low-relevance' };
  }
  return { pass: true, reason: 'ok' };
}
