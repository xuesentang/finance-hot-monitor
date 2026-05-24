import { useState, useEffect } from 'react';
import { HotspotsPage } from './pages/HotspotsPage.js';
import { KeywordsPage } from './pages/KeywordsPage.js';
import { Activity, Settings, TrendingUp } from 'lucide-react';

type Route = 'hotspots' | 'keywords';

function useHashRoute(): [Route, (r: Route) => void] {
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h1 className="text-base font-semibold text-blue-950 tracking-tight">
              金融热点监控
            </h1>
          </div>
          <nav className="flex gap-1">
            <button
              onClick={() => navigate('hotspots')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
                route === 'hotspots'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 hover:text-blue-900 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-4 h-4 inline mr-1.5" />
              热点
            </button>
            <button
              onClick={() => navigate('keywords')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
                route === 'keywords'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 hover:text-blue-900 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-1.5" />
              关键词
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {route === 'hotspots' ? <HotspotsPage /> : <KeywordsPage />}
      </main>
    </div>
  );
}

export default App;
