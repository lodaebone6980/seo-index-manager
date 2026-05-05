import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Globe, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';

const ENGINE_COLORS = {
  google: '#4285F4',
  bing: '#00809D',
  naver: '#03C75A',
  daum: '#FFCD00',
};

const STATUS_LABELS = {
  completed: '완료',
  pending: '대기',
  failed: '실패',
  requesting: '진행중',
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/dashboard/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-slate-400">로딩 중...</div>;
  if (!stats) return <div className="text-center py-20 text-red-400">데이터를 불러올 수 없습니다.</div>;

  const { overview, by_engine, recent_activity, daily_limits } = stats;

  const summaryCards = [
    { label: '전체 사이트', value: overview.total_sites, icon: Globe, color: 'text-blue-400' },
    { label: '전체 URL', value: overview.total_urls, icon: Globe, color: 'text-indigo-400' },
    { label: '색인 완료', value: overview.indexed_count, icon: CheckCircle, color: 'text-green-400' },
    { label: '대기 중', value: overview.pending_count, icon: Clock, color: 'text-yellow-400' },
    { label: '실패', value: overview.failed_count, icon: XCircle, color: 'text-red-400' },
  ];

  const chartData = by_engine.map(e => ({
    name: e.engine.toUpperCase(),
    완료: parseInt(e.completed),
    대기: parseInt(e.pending),
    실패: parseInt(e.failed),
  }));

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">대시보드</h2>

      <div className="grid grid-cols-5 gap-4 mb-8">
        {summaryCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 ${card.color}`} />
                <span className="text-sm text-slate-400">{card.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{card.value || 0}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">엔진별 색인 현황</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="완료" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="대기" fill="#eab308" radius={[4, 4, 0, 0]} />
                <Bar dataKey="실패" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-center py-10">아직 데이터가 없습니다.</p>
          )}
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">오늘의 색인 요청 한도</h3>
          {daily_limits.length > 0 ? (
            <div className="space-y-4">
              {daily_limits.map(dl => {
                const pct = Math.min((dl.count / dl.max_limit) * 100, 100);
                const isNearLimit = pct >= 80;
                return (
                  <div key={dl.engine}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 font-medium">{dl.engine.toUpperCase()}</span>
                      <span className={isNearLimit ? 'text-yellow-400' : 'text-slate-400'}>
                        {dl.count} / {dl.max_limit}
                        {isNearLimit && <AlertTriangle className="inline w-4 h-4 ml-1" />}
                      </span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isNearLimit ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-10">오늘 아직 색인 요청이 없습니다.</p>
          )}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">최근 색인 요청</h3>
        {recent_activity.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-2 px-3">URL</th>
                  <th className="text-left py-2 px-3">엔진</th>
                  <th className="text-left py-2 px-3">상태</th>
                  <th className="text-left py-2 px-3">메시지</th>
                  <th className="text-left py-2 px-3">시간</th>
                </tr>
              </thead>
              <tbody>
                {recent_activity.map(item => (
                  <tr key={item.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-2 px-3 max-w-xs truncate text-slate-300" title={item.url}>
                      {item.title || item.url}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: ENGINE_COLORS[item.engine] || '#6b7280' }}
                      >
                        {item.engine.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-medium ${
                        item.status === 'completed' ? 'text-green-400' :
                        item.status === 'failed' ? 'text-red-400' :
                        item.status === 'requesting' ? 'text-blue-400' :
                        'text-yellow-400'
                      }`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-xs max-w-xs truncate">{item.message}</td>
                    <td className="py-2 px-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 text-center py-6">아직 색인 요청 기록이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
