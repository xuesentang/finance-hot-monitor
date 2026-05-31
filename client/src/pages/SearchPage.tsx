// @ts-nocheck
// 搜索功能已阶段性放弃，此页面已隔离；后续删除搜索时清理此文件
import { useState, useCallback, useRef } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { searchApi } from '../services/api.js';
import type { SearchResponse, SearchResultItem } from '../types/index.js';
import { SOURCE_LABELS } from '../types/index.js';
import { SearchResultCard } from '../components/SearchResultCard.js';

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
  { value: 'all', label: '全部' },
] as const;

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [searched, setSearched] = useState(false);
  const searchingRef = useRef(false);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || searchingRef.current) return;

    searchingRef.current = true;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await searchApi.search({ query: trimmed, dateRange });
      setResults(data);
      setSearched(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '搜索失败';
      setError(message);
      setSearched(true);
    } finally {
      setLoading(false);
      searchingRef.current = false;
    }
  }, [query, dateRange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-blue-950 mb-1">搜索</h2>
        <p className="text-sm text-slate-500">
          输入公司名、股票代码或宏观指标，即时获取相关金融信息
        </p>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入公司名（如 宁德时代）、股票代码（如 AAPL）或宏观指标（如 CPI）..."
            disabled={loading}
            maxLength={100}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
          disabled={loading}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
        >
          {DATE_RANGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          搜索
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">搜索出错</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-slate-200 rounded-xl p-8">
              <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
            </div>
          ))}
          <p className="text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在搜索，可能需要 10~25 秒...
          </p>
        </div>
      )}

      {!loading && searched && results && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>找到 <strong className="text-blue-950">{results.totalResults}</strong> 条结果</span>
            <span>耗时 <strong>{(results.searchTimeMs / 1000).toFixed(1)}s</strong></span>
            {results.expandedKeywords.length > 1 && (
              <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-md">
                展开词: {results.expandedKeywords.slice(1).join(', ')}
              </span>
            )}
          </div>

          {Object.keys(results.sourceStats).length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {Object.entries(results.sourceStats).map(([source, count]) => (
                <span key={source} className="text-xs px-2 py-1 bg-white border border-slate-200 rounded-md">
                  {SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] || source}: {count}
                </span>
              ))}
            </div>
          )}

          {results.items.length > 0 ? (
            <div className="space-y-3">
              {results.items.map((item) => (
                <SearchResultCard key={item.url} item={item} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-400">未找到相关内容</p>
              <p className="text-sm text-slate-300 mt-1">
                建议：尝试缩短关键词、更换时间范围，或使用同义词搜索
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
