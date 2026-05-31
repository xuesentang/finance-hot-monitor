import { useState, useEffect } from 'react';
import { HotspotsPage } from './pages/HotspotsPage.js';
import { KeywordsPage } from './pages/KeywordsPage.js';
import { Activity, Settings, TrendingUp, Zap } from 'lucide-react';

type Route = 'hotspots' | 'keywords';

function App() {
  const getRoute = (): Route => {
    const hash = window.location.hash.replace('#/', '');
    if (hash === 'keywords') return 'keywords';
    return 'hotspots';
  };

  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = `#/${r}`;
  };

  return (
    <div className="min-h-screen bg-atmosphere flex">
      {/* Sidebar */}
      <aside className="w-64 bg-bg-base border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-purple via-accent-pink to-accent-orange flex items-center justify-center shadow-lg shadow-accent-purple/20">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-text-primary font-bold text-base tracking-tight leading-none">
              金融热点监控
            </h1>
            <p className="text-text-muted text-[10px] mt-0.5 tracking-wider uppercase">Finance Monitor</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          <NavItem
            icon={Activity}
            label="热点监控"
            active={route === 'hotspots'}
            onClick={() => navigate('hotspots')}
          />
          <NavItem
            icon={Settings}
            label="关键词管理"
            active={route === 'keywords'}
            onClick={() => navigate('keywords')}
          />
        </nav>

        {/* Bottom status */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-40" />
            </div>
            <div>
              <p className="text-text-secondary text-xs">6 个信源运行中</p>
              <p className="text-text-muted text-[10px]">实时监控活跃</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {route === 'hotspots' && <HotspotsPage />}
          {route === 'keywords' && <KeywordsPage />}
        </div>
      </main>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative group ${
        active
          ? 'bg-bg-surface text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface/50'
      }`}
    >
      {/* Active indicator */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-accent-purple to-accent-pink" />
      )}
      <Icon className={`w-[18px] h-[18px] ${active ? 'text-accent-purple' : 'text-text-muted group-hover:text-text-secondary'}`} />
      <span>{label}</span>
      {active && <Zap className="w-3.5 h-3.5 text-accent-orange ml-auto" />}
    </button>
  );
}

export default App;
