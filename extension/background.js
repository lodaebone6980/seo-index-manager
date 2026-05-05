// ═══════════════════════════════════════════════
// SEO 색인 관리자 - Background Service Worker
// ═══════════════════════════════════════════════

// 아이콘 클릭 시 사이드패널 열기
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// 기본 설정
const DEFAULT_CONFIG = {
  serverUrl: 'https://web-production-b7ac2.up.railway.app',
  delays: {
    naver: 5000,
    daum: 4000,
    google: 1000,
    bing: 1000,
  },
  googleApiKey: '',
  bingApiKey: '',
};

let isProcessing = false;
let currentEngine = null;
let currentSiteId = null;
let processedCount = 0;

async function getConfig() {
  const result = await chrome.storage.local.get('config');
  return { ...DEFAULT_CONFIG, ...result.config };
}

async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

async function apiCall(path, options = {}) {
  const config = await getConfig();
  const url = `${config.serverUrl}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return res.json();
}

async function getNextUrl(engine, siteId) {
  const params = siteId ? `?site_id=${siteId}` : '';
  return apiCall(`/api/queue/${engine}${params}`);
}

async function createIndexRequest(urlId, engine) {
  return apiCall('/api/index-request', {
    method: 'POST',
    body: JSON.stringify({ url_id: urlId, engine })
  });
}

async function updateIndexRequest(requestId, status, message = '') {
  return apiCall(`/api/index-request/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, message })
  });
}

// Google Indexing API
async function submitToGoogle(url) {
  const config = await getConfig();
  if (!config.googleApiKey) return { success: false, message: 'Google API 키 미설정' };
  try {
    const response = await fetch(
      `https://indexing.googleapis.com/v3/urlNotifications:publish?key=${config.googleApiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }) }
    );
    if (response.ok) return { success: true, message: 'Google 색인 요청 성공' };
    const error = await response.json();
    return { success: false, message: `Google API 오류: ${error.error?.message || response.status}` };
  } catch (err) { return { success: false, message: `Google 실패: ${err.message}` }; }
}

// Bing URL Submission API
async function submitToBing(url, siteUrl) {
  const config = await getConfig();
  if (!config.bingApiKey) return { success: false, message: 'Bing API 키 미설정' };
  try {
    const response = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${config.bingApiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, url }) }
    );
    if (response.ok) return { success: true, message: 'Bing 색인 요청 성공' };
    const errorText = await response.text();
    return { success: false, message: `Bing API 오류: ${errorText}` };
  } catch (err) { return { success: false, message: `Bing 실패: ${err.message}` }; }
}

// 네이버/다음 Content Script 통신
async function submitViaContentScript(engine, url) {
  return new Promise((resolve) => {
    const webmasterUrls = {
      naver: 'https://searchadvisor.naver.com/console/board',
      daum: 'https://webmaster.daum.net/board'
    };
    chrome.tabs.create({ url: webmasterUrls[engine], active: false }, (tab) => {
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'submit_url', engine, url }, (response) => {
              setTimeout(() => { chrome.tabs.remove(tab.id).catch(() => {}); }, 2000);
              resolve(response?.success
                ? { success: true, message: response.message || `${engine} 성공` }
                : { success: false, message: response?.message || `${engine} 실패` });
            });
          }, 3000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.remove(tab.id).catch(() => {});
        resolve({ success: false, message: `${engine} 타임아웃` });
      }, 30000);
    });
  });
}

// 메인 처리 루프
async function processQueue(engine, siteId) {
  if (isProcessing) return;
  isProcessing = true;
  currentEngine = engine;
  currentSiteId = siteId;
  processedCount = 0;
  const config = await getConfig();
  const delay = config.delays[engine] || 3000;
  broadcastStatus('started', { engine, siteId });
  try {
    while (isProcessing) {
      const queueResult = await getNextUrl(engine, siteId);
      if (queueResult.done) { broadcastStatus('completed', { engine, message: '모든 URL 처리 완료', processedCount }); break; }
      const nextUrl = queueResult.next;
      broadcastStatus('processing', { engine, url: nextUrl.url, processedCount });
      const requestResult = await createIndexRequest(nextUrl.url_id, engine);
      if (requestResult.limit_reached) { broadcastStatus('limit_reached', { engine, message: requestResult.message, processedCount }); break; }
      if (!requestResult.success) continue;
      const requestId = requestResult.request.id;
      let result;
      switch (engine) {
        case 'google': result = await submitToGoogle(nextUrl.url); break;
        case 'bing': result = await submitToBing(nextUrl.url, nextUrl.site_name); break;
        case 'naver': case 'daum': result = await submitViaContentScript(engine, nextUrl.url); break;
      }
      await updateIndexRequest(requestId, result.success ? 'completed' : 'failed', result.message);
      processedCount++;
      if (isProcessing) await new Promise(resolve => setTimeout(resolve, delay));
    }
  } catch (err) { broadcastStatus('error', { engine, message: err.message, processedCount }); }
  finally { isProcessing = false; currentEngine = null; currentSiteId = null; }
}

function stopProcessing() {
  isProcessing = false;
  broadcastStatus('stopped', { engine: currentEngine, processedCount });
}

function broadcastStatus(status, data) {
  chrome.runtime.sendMessage({ type: 'status_update', status, ...data }).catch(() => {});
  if (['completed', 'limit_reached', 'error'].includes(status)) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: 'SEO 색인 관리자', message: data.message || `${data.engine} ${status}` });
  }
}

// 메시지 핸들러
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'start_indexing': processQueue(msg.engine, msg.siteId); sendResponse({ started: true }); break;
    case 'stop_indexing': stopProcessing(); sendResponse({ stopped: true }); break;
    case 'get_status': sendResponse({ isProcessing, currentEngine, currentSiteId, processedCount }); break;
    case 'get_config': getConfig().then(config => sendResponse(config)); return true;
    case 'save_config': saveConfig(msg.config).then(() => sendResponse({ saved: true })); return true;
    case 'test_connection':
      fetch(`${msg.serverUrl}/api/sites`).then(res => res.json())
        .then(() => sendResponse({ connected: true }))
        .catch(err => sendResponse({ connected: false, error: err.message }));
      return true;
  }
});
