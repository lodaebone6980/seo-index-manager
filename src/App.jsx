import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Globe, ListChecks, Settings, Download } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Sites from './pages/Sites';
import SiteDetail from './pages/SiteDetail';
import SettingsPage from './pages/Settings';

const navItems = [
  { path: '/', label: '\uB300\uC2DC\uBCF4\uB4DC', icon: LayoutDashboard },
  { path: '/sites', label: '\uC0AC\uC774\uD2B8 \uAD00\uB9AC', icon: Globe },
  { path: '/settings', label: '\uC124\uC815', icon: Settings },
];

export default function App() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-slate-800 border-r border-slate-700 p-4 flex flex-col">
        <h1 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-blue-400" />
          SEO \uC0C9\uC778 \uAD00\uB9AC\uC790
        </h1>
        <nav className="flex-1 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}>
                <Icon className="w-5 h-5" />{item.label}
              </Link>
            );
          })}
        </nav>
        <a href="/api/export/obsidian" target="_blank"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors mt-auto">
          <Download className="w-5 h-5" />\uC635\uC2DC\uB514\uC5B8 \uB0B4\uBCF4\uB0B4\uAE30
        </a>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/sites/:id" element={<SiteDetail />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}