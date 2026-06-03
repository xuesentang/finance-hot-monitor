import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Sparkles, Trash2 } from 'lucide-react';
import type { Hotspot, SourceName } from '../types/index.js';

interface HotspotCardProps {
  hotspot: Hotspot;
  isNew?: boolean;
  onDelete?: (id: string) => void;
}

const sourceConfig: Record<SourceName, { label: string; color: string; bg: string; border: string }> = {
  'sec_edgar': { label: 'SEC EDGAR', color: 'text-source-sec', bg: 'bg-source-sec/10', border: 'border-source-sec/20' },
  'juchao': { label: '巨潮资讯', color: 'text-source-juchao', bg: 'bg-source-juchao/10', border: 'border-source-juchao/20' },
  'cailianshe': { label: '财联社', color: 'text-source-cailian', bg: 'bg-source-cailian/10', border: 'border-source-cailian/20' },
  'eastmoney': { label: '东财全球', color: 'text-source-east', bg: 'bg-source-east/10', border: 'border-source-east/20' },
  'fred': { label: 'FRED', color: 'text-source-fred', bg: 'bg-source-fred/10', border: 'border-source-fred/20' },
  'nbs': { label: '国家统计局', color: 'text-source-nbs', bg: 'bg-source-nbs/10', border: 'border-source-nbs/20' },
};

const importanceConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'high': { label: '高', color: 'text-high', bg: 'bg-high/10', border: 'border-high/20' },
  'medium': { label: '中', color: 'text-medium', bg: 'bg-medium/10', border: 'border-medium/20' },
  'low': { label: '低', color: 'text-low', bg: 'bg-low/10', border: 'border-low/20' },
};

export function HotspotCard({ hotspot, isNew, onDelete }: HotspotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const source = sourceConfig[hotspot.source] || {
    label: hotspot.source,
    color: 'text-text-secondary',
    bg: 'bg-text-muted/10',
    border: 'border-text-muted/20',
  };

  const importance = importanceConfig[hotspot.importance] || importanceConfig['low'];

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '未知时间';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div
      className={`bg-bg-surface border rounded-xl p-5 transition-all duration-300 group ${
        isNew
          ? 'border-accent-purple/40 shadow-lg shadow-accent-purple/10 animate-slide-in'
          : 'border-border hover:border-border-hover hover:bg-bg-surface-hover'
      }`}
    >
      {/* Top bar: source + importance + time */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${source.bg} ${source.color} border ${source.border}`}>
          {source.label}
        </span>
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${importance.bg} ${importance.color} border ${importance.border}`}>
          {importance.label}
        </span>
        {isNew && (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-accent-purple/10 text-accent-purple border border-accent-purple/20 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            新
          </span>
        )}
        <span className="text-text-muted text-xs ml-auto">
          {formatDate(hotspot.publishedAt)}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-text-primary font-semibold text-sm leading-relaxed mb-2 group-hover:text-accent-purple transition-colors duration-200">
        {hotspot.title}
      </h3>

      {/* AI Summary */}
      {hotspot.summary && (
        <div className="mb-3">
          <p className={`text-text-secondary text-sm leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
            {hotspot.summary}
          </p>
        </div>
      )}

      {/* Expandable details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2.5 animate-slide-in">
          {hotspot.eventType && <DetailRow label="事件类型" value={hotspot.eventType} />}
          <DetailRow label="相关度" value={`${hotspot.relevance}%`} highlight />
          {hotspot.relevanceReason && <DetailRow label="相关度原因" value={hotspot.relevanceReason} />}
          {hotspot.importanceReason && <DetailRow label="重要性原因" value={hotspot.importanceReason} />}
          {hotspot.affectedHoldings && (
            <div className="flex items-center gap-2 text-high text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-high animate-pulse" />
              可能影响持仓
            </div>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2 flex-wrap">
          {hotspot.keyword && (
            <span className="px-1.5 py-0.5 rounded-md bg-bg-elevated text-text-secondary text-[11px] font-medium">
              {hotspot.keyword.text}
            </span>
          )}
          <span className="font-mono text-accent-orange text-xs font-semibold">
            {hotspot.relevance}%
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hotspot.url && (
            <a
              href={hotspot.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-accent-purple hover:text-accent-pink text-xs transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              原文
            </a>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-text-muted hover:text-text-secondary text-xs transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                收起
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                详情
              </>
            )}
          </button>
          {onDelete && (
            <button
              onClick={async () => {
                if (deleting) return;
                setDeleting(true);
                try {
                  await onDelete(hotspot.id);
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="flex items-center gap-1 text-text-muted hover:text-high text-xs transition-colors disabled:opacity-50"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-text-muted text-xs shrink-0 w-16">{label}</span>
      <span className={`text-sm ${highlight ? 'text-accent-orange font-mono font-semibold' : 'text-text-secondary'}`}>
        {value}
      </span>
    </div>
  );
}
