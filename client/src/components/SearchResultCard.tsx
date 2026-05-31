// @ts-nocheck
// 搜索功能已阶段性放弃，此组件已隔离；后续删除搜索时清理此文件
import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Clock, Target, AlertCircle } from 'lucide-react';
import type { SearchResultItem } from '../types/index.js';
import { SOURCE_LABELS } from '../types/index.js';

interface SearchResultCardProps {
  item: SearchResultItem;
}

const SOURCE_COLORS: Record<string, string> = {
  sec_edgar: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  juchao: 'bg-violet-50 text-violet-700 border-violet-200',
  cailianshe: 'bg-sky-50 text-sky-700 border-sky-200',
  eastmoney: 'bg-teal-50 text-teal-700 border-teal-200',
  fred: 'bg-orange-50 text-orange-700 border-orange-200',
  nbs: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const IMPORTANCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', label: '高' },
  medium: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-600', label: '中' },
  low: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-500', label: '低' },
};

function highlightTerms(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;

  const limitedTerms = terms.slice(0, 10);
  const limitedText = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
  const regex = new RegExp(`(${limitedTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = limitedText.split(regex);

  return parts.map((part, i) => {
    const isMatch = limitedTerms.some(t => part.toLowerCase() === t.toLowerCase());
    return isMatch ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark> : part;
  });
}

export function SearchResultCard({ item }: SearchResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const sourceLabel = SOURCE_LABELS[item.source as keyof typeof SOURCE_LABELS] || item.source;
  const sourceColor = SOURCE_COLORS[item.source] || 'bg-slate-50 text-slate-600 border-slate-200';
  const impStyle = item.aiAnalysis
    ? IMPORTANCE_STYLES[item.aiAnalysis.importance] || IMPORTANCE_STYLES.low
    : null;

  const timeStr = item.publishedAt
    ? new Date(item.publishedAt).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="bg-white border border-slate-200 rounded-xl transition-all duration-200 hover:shadow-md">
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          <div className={`w-1 self-stretch rounded-full shrink-0 ${
            item.aiAnalysis?.importance === 'high' ? 'bg-red-500' :
            item.aiAnalysis?.importance === 'medium' ? 'bg-amber-400' :
            'bg-slate-300'
          }`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${sourceColor}`}>
                {sourceLabel}
              </span>
              {impStyle && (
                <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${impStyle.bg} ${impStyle.text} border-current/20`}>
                  {impStyle.label}
                </span>
              )}
              {!item.aiAnalysis && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  AI 分析不可用
                </span>
              )}
              {item.aiAnalysis?.eventType && item.aiAnalysis.eventType !== 'other' && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                  {item.aiAnalysis.eventType}
                </span>
              )}
            </div>

            <h3 className="text-sm font-semibold text-blue-950 leading-snug mb-1.5 group">
                {item.source === 'nbs' ? (
                  <span className="text-slate-500">{highlightTerms(item.title, item.matchedTerms)}</span>
                ) : (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener"
                    className="hover:text-primary transition-colors duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {highlightTerms(item.title, item.matchedTerms)}
                    <ExternalLink className="w-3 h-3 inline ml-1 text-slate-300 group-hover:text-primary transition-colors" />
                  </a>
                )}
            </h3>

            {item.aiAnalysis?.summary && (
              <p className="text-sm text-slate-600 leading-relaxed mb-2 line-clamp-2">
                {item.aiAnalysis.summary}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-slate-400">
              {timeStr && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timeStr}
                </span>
              )}
              {item.aiAnalysis && item.aiAnalysis.relevance > 0 && (
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {Math.round(item.aiAnalysis.relevance)}%
                </span>
              )}
              {item.matchedTerms.length > 0 && (
                <span className="text-slate-400">
                  匹配: {item.matchedTerms.slice(0, 3).join(', ')}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors duration-150 cursor-pointer shrink-0 self-start"
            aria-label={expanded ? '收起详情' : '展开详情'}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-4 border-t border-slate-100">
          <div className="pt-3 space-y-3">
            <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                {highlightTerms(item.content, item.matchedTerms)}
              </p>
            </div>

            {item.aiAnalysis && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {item.aiAnalysis.relevanceReason && (
                  <div className="bg-blue-50/50 rounded-lg p-2.5">
                    <span className="text-blue-400 font-medium">相关性</span>
                    <p className="text-slate-600 mt-0.5">{item.aiAnalysis.relevanceReason}</p>
                  </div>
                )}
                {item.aiAnalysis.importanceReason && (
                  <div className="bg-amber-50/50 rounded-lg p-2.5">
                    <span className="text-amber-400 font-medium">重要性</span>
                    <p className="text-slate-600 mt-0.5">{item.aiAnalysis.importanceReason}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
