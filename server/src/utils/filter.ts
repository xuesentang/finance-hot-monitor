import type { AIAnalysis, FilterResult, RawContent } from '../types.js';

/**
 * 第4层：阈值过滤
 *
 * 四层规则，按顺序判断，任一不通过即返回 false。
 * 对应 design-MVP-v1.0.md 第 5.5 节。
 */
export function shouldFilter(item: RawContent, analysis: AIAnalysis): FilterResult {
  if (!analysis.isSubstantial) {
    return { pass: false, reason: 'not-substantial' };
  }
  if (analysis.relevance < 40) {
    return { pass: false, reason: 'low-relevance' };
  }
  if (!analysis.keywordMentioned && analysis.relevance < 60) {
    return { pass: false, reason: 'not-mentioned-low-relevance' };
  }
  if (analysis.importance === 'low' && item.sourceType === 'news') {
    return { pass: false, reason: 'low-importance-news' };
  }
  return { pass: true, reason: 'ok' };
}
