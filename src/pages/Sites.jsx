import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, ExternalLink, Search, Globe } from 'lucide-react';

export default function Sites() {
  const [sites, setSites] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', sitemap_url: '', rss_url: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSites(); }, []);

  async function fetchSites() {
    try {
      const res = await fetch('/api/sites');
      setSites(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function addSite(e) {
    e.preventDefault();
    try {
      await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      setForm({ name: '', url: '', sitemap_url: '', rss_url: '' });
      setShowForm(false);
      fetchSites();
    } catch (err) {
      alert('사이트 추가 실패: ' + err.message);
    }
  }

  async function deleteSite(id) {
    if (!confirm('이 사이트를 삭제하시겠습니까? 관련된 모든 URL과 색인 기록이 삭제됩니다.')) return;
    try {
      await fetch(`/api/sites/${id}`, { method: 'DELETE' });
      fetchSites();
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  }

  if (loading) return <div className="text-center py-20 text-slate-400">로딩 중...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">사이트 관리</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          사이트 추가
        </button>
      </div>

      {showForm && (
        <form onSubmit={addSite} className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">사이트 이름 *</label>
              <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" placeholder="내 블로그" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">사이트 URL *</label>
              <input type="url" required value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" placeholder="https://example.com" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Sitemap URL (비워두면 자동 감지)</label>
              <input type="url" value={form.sitemap_url} onChange={e => setForm({ ...form, sitemap_url: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" placeholder="https://example.com/sitemap.xml" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">RSS URL (비워두면 자동 감지)</label>
              <input type="url" value={form.rss_url} onChange={e => setForm({ ...form, rss_url: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" placeholder="https://example.com/feed" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">추가</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg transition-colors">취소</button>
          </div>
        </form>
      )}

      {sites.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
          <Globe className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">등록된 사이트가 없습니다.</p>
          <p className="text-slate-500 text-sm">위 버튼을 눌러 사이트를 추가하세요.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sites.map(site => (
            <div key={site.id} className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <Link to={`/sites/${site.id}`} className="text-lg font-semibold text-white hover:text-blue-400 transition-colors">
                    {site.name}
                  </Link>
                  <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {site.url}
                  </p>
                  <div className="flex gap-6 mt-3 text-sm">
                    <span className="text-slate-300">URL: <span className="text-blue-400 font-medium">{site.url_count || 0}</span>개</span>
                    <span className="text-slate-300">색인 완료: <span className="text-green-400 font-medium">{site.indexed_count || 0}</span>개</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={`/sites/${site.id}`} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">상세보기</Link>
                  <button onClick={() => deleteSite(site.id)} className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
