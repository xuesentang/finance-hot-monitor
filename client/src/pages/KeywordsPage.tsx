import { useState, useEffect, useCallback } from 'react';
import { keywordsApi } from '../services/api.js';
import type { Keyword } from '../types/index.js';
import { Plus, Trash2, Settings, Tag, AlertTriangle } from 'lucide-react';

export function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchKeywords = useCallback(async () => {
    try {
      const data = await keywordsApi.list();
      setKeywords(data);
    } catch (err) {
      setError('获取关键词失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const addKeyword = async () => {
    if (!newKeyword.trim()) return;
    try {
      await keywordsApi.create(newKeyword.trim());
      setNewKeyword('');
      fetchKeywords();
    } catch (err) {
      setError('添加关键词失败');
    }
  };

  const deleteKeyword = async (id: string) => {
    try {
      await keywordsApi.remove(id);
      fetchKeywords();
    } catch (err) {
      setError('删除关键词失败');
    }
  };

  const toggleKeyword = async (id: string) => {
    try {
      await keywordsApi.toggle(id);
      fetchKeywords();
    } catch (err) {
      setError('更新关键词失败');
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">关键词管理</h1>
        <p className="text-text-secondary text-sm mt-1">配置监控关键词，系统将自动追踪相关内容</p>
      </div>

      {/* Add keyword */}
      <div className="bg-bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-purple/10">
            <Tag className="w-4 h-4 text-accent-purple" />
          </div>
          <div className="flex-1">
            <label className="text-text-primary text-sm font-semibold">添加关键词</label>
            <p className="text-text-muted text-xs mt-0.5">输入关键词后按回车或点击添加</p>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            placeholder="例如：AAPL、美联储、加息..."
            className="flex-1 px-4 py-2.5 bg-bg-input border border-border rounded-xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
          />
          <button
            onClick={addKeyword}
            disabled={!newKeyword.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-accent-purple to-accent-pink text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-accent-purple/20"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-2 mt-3 text-high text-sm">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* Keywords list */}
      <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent-purple" />
            <span className="text-text-primary text-sm font-semibold">已配置关键词</span>
          </div>
          <span className="text-text-muted text-xs">{keywords.length} 个关键词</span>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 shimmer rounded-lg" />
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-bg-elevated border border-border mb-4 animate-float">
              <Tag className="w-6 h-6 text-text-muted" />
            </div>
            <p className="text-text-secondary text-sm font-medium">暂无关键词</p>
            <p className="text-text-muted text-xs mt-1">添加关键词开始监控金融热点</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {keywords.map((keyword) => (
              <div
                key={keyword.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-bg-surface-hover transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleKeyword(keyword.id)}
                    className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                      keyword.isActive ? 'bg-accent-purple' : 'bg-text-muted/30'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        keyword.isActive ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm font-medium ${
                      keyword.isActive ? 'text-text-primary' : 'text-text-muted line-through'
                    }`}
                  >
                    {keyword.text}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-text-muted text-xs">
                    匹配 {keyword._count?.hotspots || 0} 条
                  </span>
                  <button
                    onClick={() => deleteKeyword(keyword.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-high hover:bg-high/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
