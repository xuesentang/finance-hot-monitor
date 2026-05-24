import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Activity, TrendingUp, AlertTriangle, Radio } from 'lucide-react';
import { hotspotsApi } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { HotspotCard } from '../components/HotspotCard.js';
import { FilterBar } from '../components/FilterBar.js';
import type { Hotspot, Stats } from '../types/index.js';

export function HotspotsPage() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [source, setSource] = useState('');
  const [importance, setImportance] = useState('');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '20' };
      if (source) params.source = source;
      if (importance) params.importance = importance;

      const [data, statsData] = await Promise.all([
        hotspotsApi.list(params),
        hotspotsApi.stats(),
      ]);

      setHotspots(data.data);
      setTotalPages(data.pagination.totalPages);
      setStats(statsData);
    } catch (e) {
      console.error('Failed to load hotspots:', e);
    } finally {
      setLoading(false);
    }
  }, [source, importance]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  useEffect(() => {
    setPage(1);
  }, [source, importance]);

  // 用 ref 保持筛选条件最新值，避免 WebSocket 事件中闭包过时
  const filterRef = useRef({ source, importance });
  filterRef.current = { source, importance };

  // WebSocket: 实时接收新热点
  useEffect(() => {
    const socket = getSocket();

    const handleNew = (hotspot: Hotspot) => {
      // 检查是否符合当前筛选条件
      const { source: s, importance: imp } = filterRef.current;
      if (s && hotspot.source !== s) return;
      if (imp && hotspot.importance !== imp) return;

      setNewIds((prev) => new Set([...prev, hotspot.id]));
      setHotspots((prev) => {
        if (prev.some((h) => h.id === hotspot.id)) return prev;
        return [hotspot, ...prev];
      });
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          next.delete(hotspot.id);
          return next;
        });
      }, 5000);
    };

    socket.on('hotspot:new', handleNew);
    return () => {
      socket.off('hotspot:new', handleNew);
    };
  }, []);

  const handleTriggerCheck = async () => {
    if (checking) return;
    setChecking(true);
    setCheckMsg(null);
    try {
      await hotspotsApi.triggerCheck();
      setCheckMsg('检测完成，新热点将实时推送');
      await load(page);
    } catch (e: any) {
      setCheckMsg(e.message || '检测失败');
    } finally {
      setChecking(false);
      setTimeout(() => setCheckMsg(null), 4000);
    }
  };

  return (
    <div>
      {/* 统计概览 */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatCard
            label="总热点"
            value={stats.total}
            icon={<Activity className="w-4 h-4" />}
            color="text-blue-600"
            bg="bg-blue-50"
          />
          <StatCard
            label="今日新增"
            value={stats.today}
            icon={<TrendingUp className="w-4 h-4" />}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <StatCard
            label="高重要性"
            value={stats.high}
            icon={<AlertTriangle className="w-4 h-4" />}
            color="text-amber-600"
            bg="bg-amber-50"
          />
          <StatCard
            label="活跃信源"
            value={Object.keys(stats.bySource).length}
            icon={<Radio className="w-4 h-4" />}
            color="text-indigo-600"
            bg="bg-indigo-50"
          />
        </div>
      )}

      {/* 筛选 + 操作 */}
      <div className="flex items-center justify-between mb-4">
        <FilterBar
          source={source}
          importance={importance}
          onSourceChange={setSource}
          onImportanceChange={setImportance}
        />
        <button
          onClick={handleTriggerCheck}
          disabled={checking}
          className="px-3 py-1.5 text-sm text-slate-500 hover:text-primary hover:bg-blue-50 rounded-lg transition-colors duration-200 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? '检测中...' : '手动检测'}
        </button>
        {checkMsg && (
          <span className={`text-xs ml-2 ${checkMsg.includes('失败') ? 'text-red-500' : 'text-emerald-600'}`}>
            {checkMsg}
          </span>
        )}
      </div>

      {/* 热点列表 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
              <div className="flex gap-2 mb-2">
                <div className="h-5 w-16 bg-slate-100 rounded" />
                <div className="h-5 w-12 bg-slate-100 rounded" />
              </div>
              <div className="h-4 w-3/4 bg-slate-100 rounded mb-2" />
              <div className="h-3 w-1/2 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      ) : hotspots.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">暂无热点</p>
          <p className="text-slate-300 text-xs mt-1">添加关键词后开始监控</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {hotspots.map((h) => (
            <HotspotCard key={h.id} hotspot={h} onNew={newIds.has(h.id)} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 text-sm rounded-lg transition-colors duration-200 cursor-pointer ${
                p === page
                  ? 'bg-primary text-white font-medium'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon, color, bg,
}: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`${color} ${bg} p-1.5 rounded-lg`}>{icon}</span>
        <span className="text-xs text-slate-400 font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
