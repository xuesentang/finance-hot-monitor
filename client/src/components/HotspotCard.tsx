import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Share2, Clock, Target } from 'lucide-react';
import type { Hotspot } from '../types/index.js';
import { SOURCE_LABELS } from '../types/index.js';

interface HotspotCardProps {
  hotspot: Hotspot;
  onNew?: boolean;
}

const IMPORTANCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', label: '高' },
  medium: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-600', label: '中' },
  low: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-500', label: '低' },
};

const SOURCE_COLORS: Record<string, string> = {
  sec_edgar: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  juchao: 'bg-violet-50 text-violet-700 border-violet-200',
  cailianshe: 'bg-sky-50 text-sky-700 border-sky-200',
  eastmoney: 'bg-teal-50 text-teal-700 border-teal-200',
  fred: 'bg-orange-50 text-orange-700 border-orange-200',
  nbs: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function HotspotCard({ hotspot, onNew }: HotspotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const relatedSources: string[] = hotspot.relatedSources
    ? JSON.parse(hotspot.relatedSources)
    : [];

  const sourceLabel = SOURCE_LABELS[hotspot.source as keyof typeof SOURCE_LABELS] || hotspot.source;
  const sourceColor = SOURCE_COLORS[hotspot.source] || 'bg-slate-50 text-slate-600 border-slate-200';
  const impStyle = IMPORTANCE_STYLES[hotspot.importance] || IMPORTANCE_STYLES.low;

  const time = hotspot.publishedAt || hotspot.createdAt;
  const timeStr = new Date(time).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`bg-white border rounded-xl transition-all duration-200 hover:shadow-md cursor-pointer ${
        onNew ? 'border-blue-300 bg-blue-50/40 shadow-blue-100' : 'border-slate-200'
      }`}
    >
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          {/* 左侧：重要性指示条 */}
          <div className={`w-1 self-stretch rounded-full shrink-0 ${
            hotspot.importance === 'high' ? 'bg-red-500' :
            hotspot.importance === 'medium' ? 'bg-amber-400' :
            'bg-slate-300'
          }`} />

          <div className="flex-1 min-w-0">
            {/* 标签行 */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${sourceColor}`}>
                {sourceLabel}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${impStyle.bg} ${impStyle.text} border-current/20`}>
                {impStyle.label}
              </span>
              {hotspot.eventType && hotspot.eventType !== 'other' && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                  {hotspot.eventType}
                </span>
              )}
              {relatedSources.length > 0 && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Share2 className="w-3 h-3" />
                  {relatedSources.length + 1} 源
                </span>
              )}
            </div>

            {/* 标题 */}
            <h3 className="text-sm font-semibold text-blue-950 leading-snug mb-1.5 group">
              <a
                href={hotspot.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {hotspot.title}
                <ExternalLink className="w-3 h-3 inline ml-1 text-slate-300 group-hover:text-primary transition-colors" />
              </a>
            </h3>

            {/* AI 摘要 */}
            {hotspot.summary && (
              <p className="text-sm text-slate-600 leading-relaxed mb-2 line-clamp-2">
                {hotspot.summary}
              </p>
            )}

            {/* 底部信息 */}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeStr}
              </span>
              {hotspot.keyword && (
                <span className="px-1.5 py-0.5 bg-slate-100 rounded-md text-slate-500">
                  {hotspot.keyword.text}
                </span>
              )}
              {hotspot.relevance > 0 && (
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {hotspot.relevance}%
                </span>
              )}
            </div>
          </div>

          {/* 展开按钮 */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors duration-150 cursor-pointer shrink-0 self-start"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-slate-100">
          <div className="pt-3 space-y-3">
            {/* 原始内容 */}
            <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                {hotspot.content}
              </p>
            </div>

            {/* AI 分析详情 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {hotspot.relevanceReason && (
                <div className="bg-blue-50/50 rounded-lg p-2.5">
                  <span className="text-blue-400 font-medium">相关性</span>
                  <p className="text-slate-600 mt-0.5">{hotspot.relevanceReason}</p>
                </div>
              )}
              {hotspot.importanceReason && (
                <div className="bg-amber-50/50 rounded-lg p-2.5">
                  <span className="text-amber-400 font-medium">重要性</span>
                  <p className="text-slate-600 mt-0.5">{hotspot.importanceReason}</p>
                </div>
              )}
              {hotspot.eventFingerprint && (
                <div className="col-span-full bg-slate-50 rounded-lg p-2.5">
                  <span className="text-slate-400 font-medium">事件指纹</span>
                  <code className="text-xs text-slate-500 ml-2">{hotspot.eventFingerprint}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
