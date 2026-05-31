import type { AIAnalysis, FilterResult, RawContent } from '../types.js';

/**
 * 第4层：阈值过滤
 *
 * 放宽版规则，监控场景宁可多看不要漏看：
 *   1. 非实质且极低相关性 → 丢弃
 *   2. 简单相关性 < 25 → 丢弃
 *   3. 未提及关键词 + 相关性 < 40 → 丢弃
 *   4. 低重要性快讯 → 保留（监控用户可能想看）
 */
export function shouldFilter(item: RawContent, analysis: AIAnalysis): FilterResult {
  if (!analysis.isSubstantial && analysis.relevance < 20) {
    return { pass: false, reason: 'not-substantial-low-relevance' };
  }
  if (analysis.relevance < 25) {
    return { pass: false, reason: 'low-relevance' };
  }
  if (!analysis.keywordMentioned && analysis.relevance < 40) {
    return { pass: false, reason: 'not-mentioned-low-relevance' };
  }
  return { pass: true, reason: 'ok' };
}
