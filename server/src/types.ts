// 信源名称
export type SourceName = 'sec_edgar' | 'juchao' | 'cailianshe' | 'eastmoney' | 'fred' | 'nbs';

// 内容类型
export type SourceType = 'announcement' | 'news' | 'macro_data';

// 关键词类型
export type KeywordType = 'stock_code' | 'stock_name' | 'sector' | 'macro' | 'policy' | 'generic';

// 重要性级别
export type Importance = 'low' | 'medium' | 'high';

// Python 采集脚本返回的原始内容
export interface RawContent {
  title: string;
  content: string;
  url: string;
  source: SourceName;
  sourceType: SourceType;
  publishedAt: string | null;
  extraData?: Record<string, unknown>;
  expandedTerms?: string[];
}

// AI 分析结果
export interface AIAnalysis {
  eventType: string;
  isSubstantial: boolean;
  relevance: number;
  relevanceReason: string;
  keywordMentioned: boolean;
  importance: Importance;
  importanceReason: string;
  summary: string;
  affectedHoldings: boolean;
  eventFingerprint: string;
}

// 阈值过滤结果
export interface FilterResult {
  pass: boolean;
  reason: string;
}

// 水位线数据
export interface Watermark {
  lastId?: string;
  lastTimestamp?: number;
  extraData?: Record<string, unknown>;
}

// 采集器返回结果
export interface CollectResult {
  items: RawContent[];
  watermark: Watermark;
}

// 热点列表项（含关联关键词）
export interface HotspotWithKeyword {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  sourceType: string;
  eventType: string | null;
  isSubstantial: boolean;
  relevance: number;
  relevanceReason: string | null;
  keywordMentioned: boolean;
  importance: string;
  importanceReason: string | null;
  summary: string | null;
  affectedHoldings: boolean;
  eventFingerprint: string | null;
  relatedSources: string | null;
  isPrimary: boolean;
  publishedAt: string | null;
  createdAt: string;
  keywordId: string;
  keyword: { id: string; text: string; type: string } | null;
}

// ========== 搜索功能类型 ==========

export interface SearchParams {
  query: string;
  sources?: SourceName[];
  dateRange?: '7d' | '30d' | '90d' | 'all';
  limit?: number;
}

export interface SearchResultItem {
  title: string;
  content: string;
  url: string;
  source: SourceName;
  sourceType: SourceType;
  publishedAt: string | null;
  aiAnalysis: AIAnalysis | null;
  matchedTerms: string[];
}

export interface SearchResponse {
  query: string;
  totalResults: number;
  searchTimeMs: number;
  items: SearchResultItem[];
  expandedKeywords: string[];
  sourceStats: Record<string, number>;
}
