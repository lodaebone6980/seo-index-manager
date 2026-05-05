import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';

const ENGINE_COLORS = {
  google: '#4285F4',
  bing: '#00809D',
  naver: '#03C75A',
  daum: '#FFCD00',
};

const ENGINES = ['google', 'bing', 'naver', 'daum'];

export default function SiteDetail() {
  const { id } = useParams();
  const [site, setSite] = useState(null);
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const [sitesRes, urlsRes] = await Promise.all([
        fetch('/api/sites'),
        fetch(`/api/sites/${id}/urls`)
      ]);
      const sites = await sitesRes.json();
      setSite(sites.find(s => s.id === parseInt(id)));
      setUrls(await urlsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function extractUrls() {
    setExtracting(true);
    try {
      const res = await fetch(`/api/sites/${id}/extract`, { method: 'POST' });
      const data = await res.json();
      alert(`${data.total}개 URL 발견, ${data.inserted}개 저장 완료`);
      fetchData();
    } catch (err) {
      alert('URL 추출 실패: ' + err.message);
    } finally {
      setExtracting(false);
    }
  }

  function getEngineStatus(url, engine) {
    if (!url.index_status) return null;
    return url.index_status.find(s => s.engine === engine);
  }

  function StatusIcon({ status }) {
    if (!status) return <span className="text-slate-600">-</span>;
    switch (status.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" title="완료" />;
      case 'requesting':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" title="진행중" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" title={status.message || '실패'} />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" title="대기중" />;
      default:
        return <span className="text-slate-600">-</span>;
    }
  }

  if (loading) return <div className="text-center py-20 text-slate-400">로딩 중...</div>;
  if (!site) return <div className="text-center py-20 text-red-400">사이트를 찾을 수 없습니다.</div>;

  return (
    <div>
      <Link to="/sites" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> 사이트 목록으로
      </Link>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{site.name}</h2>
          <p className="text-slate-400 mt-1">{site.url}</p>
          {site.sitemap_url && <p className="text-slate-500 text-sm mt-1">Sitemap: {site.sitemap_url}</p>}
          {site.rss_url && <p className="text-slate-500 text-sm">RSS: {site.rss_url}</p>}
        </div>
        <button
          onClick={extractUrls}
          disabled={extracting}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {extracting ? 'URL 추출 중...' : 'URL 추출 (Sitemap/RSS)'}
        </button>
      </div>

      {/* URL 목록 테이블 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">URL 목록 ({urls.length}개)</h3>
        </div>

        {urls.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p>추출된 URL이 없습니다.</p>
            <p className="text-sm mt-1">위 버튼을 눌러 Sitemap/RSS에서 URL을 추출하세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left py-3 px-4 w-12">#</th>
                  <th className="text-left py-3 px-4">URL / 제목</th>
                  <th className="text-left py-3 px-4">출처</th>
                  {ENGINES.map(engine => (
                    <th key={engine} className="text-center py-3 px-3 w-20">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: ENGINE_COLORS[engine] }}
                      >
                        {engine.toUpperCase()}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {urls.map((url, idx) => (
                  <tr key={url.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-2.5 px-4 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4">
                      <div className="max-w-lg">
                        {url.title && <p className="text-slate-200 text-sm truncate">{url.title}</p>}
                        <p className="text-slate-400 text-xs truncate" title={url.url}>{url.url}</p>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">
                        {url.source}
                      </span>
                    </td>
                    {ENGINES.map(engine => (
                      <td key={engine} className="py-2.5 px-3 text-center">
                        <StatusIcon status={getEngineStatus(url, engine)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
