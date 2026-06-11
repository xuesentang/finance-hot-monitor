import { SlidersHorizontal, X } from 'lucide-react';
import type { HotspotFilter } from '../types/index.js';

interface FilterBarProps {
  filter: HotspotFilter;
  onFilterChange: (filter: HotspotFilter) => void;
}

const sources = [
  { value: 'sec_edgar', label: 'SEC EDGAR' },
  { value: 'juchao', label: '巨潮公告' },
  { value: 'cailianshe', label: '财联社' },
  { value: 'eastmoney', label: '东财全球' },
  { value: 'fred', label: 'FRED' },
  { value: 'nbs', label: '国家统计局' },
];

export function FilterBar({ filter, onFilterChange }: FilterBarProps) {
  const hasActiveFilters =
    (filter.sources && filter.sources.length > 0) ||
    filter.importance ||
    filter.isSubstantial !== undefined ||
    filter.keywordId;

  const clearFilters = () => {
    onFilterChange({});
  };

  return (
    <div className="bg-bg-surface border border-border rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-accent-purple" />
          <span className="text-text-primary text-sm font-semibold">筛选条件</span>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            清除筛选
          </button>
        )}
      </div>

      {/* Filter rows */}
      <div className="grid grid-cols-4 gap-4">
        {/* Source filter */}
        <div className="space-y-1.5">
          <label className="text-text-muted text-xs font-medium">信源</label>
          <select
            value={filter.sources?.[0] || ''}
            onChange={(e) => {
              const value = e.target.value;
              onFilterChange({
                ...filter,
                sources: value ? [value] : undefined,
              });
            }}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
          >
            <option value="">全部信源</option>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Importance filter */}
        <div className="space-y-1.5">
          <label className="text-text-muted text-xs font-medium">重要性</label>
          <select
            value={filter.importance || ''}
            onChange={(e) => {
              const value = e.target.value as 'high' | 'medium' | 'low' | '';
              onFilterChange({
                ...filter,
                importance: value || undefined,
              });
            }}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
          >
            <option value="">全部</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>

        {/* Substantial filter */}
        <div className="space-y-1.5">
          <label className="text-text-muted text-xs font-medium">事件性质</label>
          <select
            value={
              filter.isSubstantial === undefined
                ? ''
                : filter.isSubstantial
                ? 'substantial'
                : 'non-substantial'
            }
            onChange={(e) => {
              const value = e.target.value;
              onFilterChange({
                ...filter,
                isSubstantial:
                  value === ''
                    ? undefined
                    : value === 'substantial',
              });
            }}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
          >
            <option value="">全部</option>
            <option value="substantial">实质性事件</option>
            <option value="non-substantial">非实质性</option>
          </select>
        </div>

        {/* Sort */}
        <div className="space-y-1.5">
          <label className="text-text-muted text-xs font-medium">排序</label>
          <select
            value={filter.sortBy || 'createdAt'}
            onChange={(e) => {
              onFilterChange({
                ...filter,
                sortBy: e.target.value as 'createdAt' | 'relevance' | 'publishedAt',
              });
            }}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
          >
            <option value="createdAt">入库时间</option>
            <option value="relevance">相关度</option>
            <option value="publishedAt">发布时间</option>
          </select>
        </div>
      </div>
    </div>
  );
}
