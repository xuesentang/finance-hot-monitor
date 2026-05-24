export type SourceName = 'sec_edgar' | 'juchao' | 'cailianshe' | 'eastmoney' | 'fred' | 'nbs';
export type SourceType = 'announcement' | 'news' | 'macro_data';
export type Importance = 'low' | 'medium' | 'high';

export interface Keyword {
  id: string;
  text: string;
  type: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { hotspots: number };
}

export interface Hotspot {
  id: string;
  title: string;
  content: string;
  url: string;
  source: SourceName;
  sourceType: SourceType;
  eventType: string | null;
  isSubstantial: boolean;
  relevance: number;
  relevanceReason: string | null;
  keywordMentioned: boolean;
  importance: Importance;
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

export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string | null;
  isRead: boolean;
  createdAt: string;
  hotspotId: string;
  hotspot?: { id: string; title: string; importance: Importance };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Stats {
  total: number;
  today: number;
  high: number;
  bySource: Record<string, number>;
}

export const SOURCE_LABELS: Record<SourceName, string> = {
  sec_edgar: 'SEC EDGAR',
  juchao: '巨潮资讯',
  cailianshe: '财联社',
  eastmoney: '东财全球',
  fred: 'FRED',
  nbs: '国家统计局',
};

export const IMPORTANCE_COLORS: Record<string, string> = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-gray-500 bg-gray-50 border-gray-200',
};
