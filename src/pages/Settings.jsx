import React, { useState } from 'react';
import { Save, Info } from 'lucide-react';

const ENGINE_DEFAULTS = {
  google: { label: 'Google', limit: 200, note: 'Google Indexing API 일일 한도 (기본 200건)' },
  bing: { label: 'Bing', limit: 100, note: 'Bing URL Submission API 일일 한도 (기본 100건)' },
  naver: { label: 'Naver', limit: 50, note: '네이버 웹마스터는 브라우저 자동화 방식 (캡차 가능성 고려)' },
  daum: { label: 'Daum', limit: 20, note: '다음 웹마스터는 일일 한도가 매우 적음 (약 20건)' },
};

export default function SettingsPage() {
  const [limits, setLimits] = useState(
    Object.fromEntries(Object.entries(ENGINE_DEFAULTS).map(([k, v]) => [k, v.limit]))
  );
  const [saved, setSaved] = useState(false);
  const [serverUrl, setServerUrl] = useState(
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  );

  async function saveLimits() {
    try {
      for (const [engine, max_limit] of Object.entries(limits)) {
        await fetch('/api/settings/limits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engine, max_limit })
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('저장 실패: ' + err.message);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">설정</h2>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">서버 연결 정보</h3>
        <div className="bg-slate-700/50 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-slate-300 text-sm">크롬 확장프로그램에서 아래 서버 URL을 입력하여 연결하세요.</p>
            <code className="block mt-2 bg-slate-900 text-green-400 px-3 py-2 rounded text-sm font-mono">{serverUrl}</code>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">엔진별 일일 색인 요청 한도</h3>
        <div className="space-y-4">
          {Object.entries(ENGINE_DEFAULTS).map(([engine, config]) => (
            <div key={engine}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-slate-300 font-medium">{config.label}</label>
                <input type="number" min={1} value={limits[engine]}
                  onChange={e => setLimits({ ...limits, [engine]: parseInt(e.target.value) || 1 })}
                  className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-right focus:outline-none focus:border-blue-500" />
              </div>
              <p className="text-xs text-slate-500">{config.note}</p>
            </div>
          ))}
        </div>
        <button onClick={saveLimits}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors mt-6">
          <Save className="w-4 h-4" />
          {saved ? '저장 완료!' : '한도 저장'}
        </button>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">옵시디언 연동</h3>
        <div className="space-y-3 text-sm text-slate-300">
          <p>대시보드의 "옵시디언 내보내기" 버튼을 누르면 현재 색인 현황이 마크다운 파일로 다운로드됩니다.</p>
          <p>이 파일을 옵시디언 볼트 폴더에 저장하면 자동으로 동기화됩니다.</p>
          <div className="bg-slate-700/50 rounded-lg p-4 mt-3">
            <p className="text-slate-400 text-xs mb-2">자동화 팁:</p>
            <p className="text-slate-300 text-xs">
              cron이나 스케줄러를 사용하여 주기적으로 <code className="bg-slate-900 px-1 rounded">/api/export/obsidian</code> 엔드포인트를 호출하고
              결과를 옵시디언 볼트에 저장하면 자동 업데이트됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
