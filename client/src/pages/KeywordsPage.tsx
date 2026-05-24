import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Power, PowerOff, Tag } from 'lucide-react';
import { keywordsApi } from '../services/api.js';
import type { Keyword } from '../types/index.js';

const TYPE_LABELS: Record<string, string> = {
  stock_code: '代码',
  stock_name: '公司',
  sector: '板块',
  macro: '宏观',
  policy: '政策',
  generic: '通用',
};

export function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await keywordsApi.list();
      setKeywords(data);
    } catch (e) {
      console.error('Failed to load keywords:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!text.trim() || adding) return;
    setAdding(true);
    try {
      await keywordsApi.create(text.trim());
      setText('');
      await load();
    } catch (e: any) {
      alert(e.message || '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (kw: Keyword) => {
    try {
      await keywordsApi.toggle(kw.id);
      await load();
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  const handleDelete = async (kw: Keyword) => {
    if (!confirm(`确定删除关键词「${kw.text}」？`)) return;
    try {
      await keywordsApi.remove(kw.id);
      await load();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="添加关键词：AAPL / CPI / 000002 / 新能源..."
          className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-shadow duration-200"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !text.trim()}
          className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          添加
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : keywords.length === 0 ? (
        <div className="text-center py-16">
          <Tag className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">暂无关键词</p>
          <p className="text-slate-300 text-xs mt-1">在上方输入框中添加第一个监控关键词</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keywords.map((kw) => (
            <div
              key={kw.id}
              className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-colors duration-150"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${kw.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className={`text-sm font-medium truncate ${kw.isActive ? 'text-blue-950' : 'text-slate-400 line-through'}`}>
                  {kw.text}
                </span>
                <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-medium shrink-0">
                  {TYPE_LABELS[kw.type] || kw.type}
                </span>
                {kw._count && (
                  <span className="text-xs text-slate-400 tabular-nums shrink-0">
                    {kw._count.hotspots} 条
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(kw)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors duration-150 cursor-pointer"
                  title={kw.isActive ? '暂停监控' : '启用监控'}
                >
                  {kw.isActive ? (
                    <Power className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <PowerOff className="w-4 h-4 text-slate-300" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(kw)}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4 text-slate-300 hover:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
