import { useState, useEffect, useCallback, useRef } from 'react';
import { FilterBar } from '../components/FilterBar.js';
import { HotspotCard } from '../components/HotspotCard.js';
import { hotspotsApi, notificationsApi } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import type { Hotspot, HotspotFilter, Notification } from '../types/index.js';
import { Activity, Bell, TrendingUp, Shield, Zap } from 'lucide-react';

export function HotspotsPage() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [stats, setStats] = useState({
    totalHotspots: 0,
    newToday: 0,
    highRelevance: 0,
    sourcesActive: 6,
  });
  const [filter, setFilter] = useState<HotspotFilter>({});
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [newHotspotIds, setNewHotspotIds] = useState<Set<string>>(new Set());
  const prevHotspotsRef = useRef<Set<string>>(new Set());

  const fetchHotspots = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filter.sources?.length) params.source = filter.sources[0];
      if (filter.importance) params.importance = filter.importance;
      if (filter.isSubstantial !== undefined) params.isSubstantial = String(filter.isSubstantial);
      if (filter.keywordId) params.keywordId = filter.keywordId;
      if (filter.sortBy) params.sortBy = filter.sortBy;

      const data = await hotspotsApi.list(params);
      const currentIds = new Set(data.data.map((h) => h.id));
      const newIds = new Set<string>();
      if (prevHotspotsRef.current.size > 0) {
        for (const id of currentIds) {
          if (!prevHotspotsRef.current.has(id)) {
            newIds.add(id);
          }
        }
      }
      if (newIds.size > 0) {
        setNewHotspotIds(newIds);
        setTimeout(() => setNewHotspotIds(new Set()), 5000);
      }
      prevHotspotsRef.current = currentIds;
      setHotspots(data.data);
    } catch (error) {
      console.error('Failed to fetch hotspots:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await hotspotsApi.stats();
      setStats({
        totalHotspots: data.total,
        newToday: data.today,
        highRelevance: data.high,
        sourcesActive: 6,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list({ limit: '20' });
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, []);

  useEffect(() => {
    fetchHotspots();
    fetchStats();
    fetchNotifications();
  }, [fetchHotspots, fetchStats, fetchNotifications]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('newHotspot', (hotspot: Hotspot) => {
      setHotspots((prev) => [hotspot, ...prev]);
      setNewHotspotIds((prev) => new Set(prev).add(hotspot.id));
      setTimeout(() => {
        setNewHotspotIds((prev) => {
          const next = new Set(prev);
          next.delete(hotspot.id);
          return next;
        });
      }, 5000);
    });

    socket.on('newNotification', (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev]);
    });

    return () => {
      socket.off('newHotspot');
      socket.off('newNotification');
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">热点监控</h1>
          <p className="text-text-secondary text-sm mt-1">实时追踪全球金融市场重要事件</p>
        </div>
        <button
          onClick={() => setShowNotificationPanel(!showNotificationPanel)}
          className="relative p-2.5 rounded-xl bg-bg-surface border border-border hover:border-border-hover transition-all duration-200"
        >
          <Bell className="w-5 h-5 text-text-secondary" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-accent-pink to-accent-orange text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 stagger-children">
        <StatCard
          label="热点总数"
          value={stats.totalHotspots}
          icon={Activity}
          iconBg="bg-accent-purple/10"
          iconColor="text-accent-purple"
          accentColor="from-accent-purple/20"
        />
        <StatCard
          label="今日新增"
          value={stats.newToday}
          icon={Zap}
          iconBg="bg-accent-pink/10"
          iconColor="text-accent-pink"
          accentColor="from-accent-pink/20"
        />
        <StatCard
          label="高相关度"
          value={stats.highRelevance}
          icon={TrendingUp}
          iconBg="bg-accent-orange/10"
          iconColor="text-accent-orange"
          accentColor="from-accent-orange/20"
        />
        <StatCard
          label="活跃信源"
          value={stats.sourcesActive}
          icon={Shield}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500"
          accentColor="from-emerald-500/20"
        />
      </div>

      {/* Filter bar */}
      <FilterBar filter={filter} onFilterChange={setFilter} />

      {/* Hotspots list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-surface border border-border rounded-xl p-5 h-32 shimmer rounded-xl" />
          ))}
        </div>
      ) : hotspots.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-surface border border-border mb-4 animate-float">
            <Activity className="w-8 h-8 text-text-muted" />
          </div>
          <p className="text-text-secondary text-base font-medium">暂无热点数据</p>
          <p className="text-text-muted text-sm mt-1">系统正在持续监控中，新热点将自动推送</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hotspots.map((hotspot) => (
            <HotspotCard
              key={hotspot.id}
              hotspot={hotspot}
              isNew={newHotspotIds.has(hotspot.id)}
            />
          ))}
        </div>
      )}

      {/* Notification panel */}
      {showNotificationPanel && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowNotificationPanel(false)}
          onMarkAllRead={async () => {
            await Promise.all(
              notifications.filter((n) => !n.isRead).map((n) => notificationsApi.markRead(n.id))
            );
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  accentColor,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  accentColor: string;
}) {
  return (
    <div className="bg-bg-surface border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-border-hover hover:-translate-y-0.5 transition-all duration-300">
      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-purple/30 to-transparent opacity-60" />

      <div className="flex items-center justify-between mb-3">
        <span className="text-text-secondary text-xs font-medium uppercase tracking-wider">{label}</span>
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>

      <p className="text-3xl font-bold text-text-primary font-mono tabular-nums tracking-tight">
        {value}
      </p>

      {/* Bottom hover glow */}
      <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${accentColor} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
    </div>
  );
}

function NotificationPanel({
  notifications,
  onClose,
  onMarkAllRead,
}: {
  notifications: Notification[];
  onClose: () => void;
  onMarkAllRead: () => void;
}) {
  return (
    <div className="fixed right-6 top-20 w-96 max-h-[70vh] bg-bg-elevated border border-border rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-text-primary font-semibold text-sm">通知中心</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllRead}
            className="text-xs text-accent-purple hover:text-accent-pink transition-colors"
          >
            全部已读
          </button>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors">
            ✕
          </button>
        </div>
      </div>
      <div className="overflow-y-auto max-h-[60vh]">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-8 h-8 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted text-sm">暂无通知</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 border-b border-border hover:bg-bg-surface transition-colors ${
                !notification.isRead ? 'bg-bg-surface/30' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  notification.type === 'HIGH_RELEVANCE' ? 'bg-high' :
                  notification.type === 'SUBSTANTIAL_EVENT' ? 'bg-medium' :
                  'bg-accent-purple'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium">{notification.title}</p>
                  <p className="text-text-secondary text-xs mt-1">{notification.content || ''}</p>
                  <p className="text-text-muted text-[10px] mt-1.5">
                    {new Date(notification.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
