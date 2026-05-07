// âââââââââââââââââââââââââââââââââââââââââââââââ
// SEO ìì¸ ê´ë¦¬ì - Background Service Worker
// âââââââââââââââââââââââââââââââââââââââââââââââ

// ìì´ì½ í´ë¦­ ì ì¬ì´ëí¨ë ì´ê¸°
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ê¸°ë³¸ ì¤ì 
const DEFAULT_CONFIG = {
  serverUrl: 'https://web-production-b7ac2.up.railway.app',
  delays: {
    naver: 5000,    // ë¤ì´ë²: ìº¡ì°¨ ë°©ì§ 5ì´ ëë ì´
    daum: 4000,     // ë¤ì: 4ì´ ëë ì´
    google: 1000,   // êµ¬ê¸ API: 1ì´
    bing: 1000,     // ë¹ API: 1ì´
  },
  googleApiKey: '',
  bingApiKey: '',
};

let isProcessing = false;
let currentEngine = null;
let currentSiteId = null;
let processedCount = 0;

// ââ ì¤ì  ê´ë¦¬ ââ
async function getConfig() {
  const result = await chrome.storage.local.get('config');
  return { ...DEFAULT_CONFIG, ...result.config };
}

async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

// ââ API íµì  ââ
async function apiCall(path, options = {}) {
  const config = await getConfig();
  const url = `${config.serverUrl}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return res.json();
}

// ââ ë¤ì ì²ë¦¬í  URL ê°ì ¸ì¤ê¸° ââ
async function getNextUrl(engine, siteId) {
  const params = siteId ? `?site_id=${siteId}` : '';
  return apiCall(`/api/queue/${engine}${params}`);
}

// ââ ìì¸ ìì²­ ìì± ââ
async function createIndexRequest(urlId, engine) {
  return apiCall('/api/index-request', {
    method: 'POST',
    body: JSON.stringify({ url_id: urlId, engine })
  });
}

// ââ ìì¸ ìì²­ ìí ìë°ì´í¸ ââ
async function updateIndexRequest(requestId, status, message = '') {
  return apiCall(`/api/index-request/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, message })
  });
}

// âââââââââââââââââââââââââââââââââââââââââââââââ
// Google Indexing API
// âââââââââââââââââââââââââââââââââââââââââââââââ
async function submitToGoogle(url) {
  const config = await getConfig();
  if (!config.googleApiKey) {
    return { success: false, message: 'Google API í¤ê° ì¤ì ëì§ ìììµëë¤.' };
  }

  try {
    const response = await fetch(
      `https://indexing.googleapis.com/v3/urlNotifications:publish?key=${config.googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          type: 'URL_UPDATED'
        })
      }
    );

    if (response.ok) {
      return { success: true, message: 'Google ìì¸ ìì²­ ì±ê³µ' };
    } else {
      const error = await response.json();
      return { success: false, message: `Google API ì¤ë¥: ${error.error?.message || response.status}` };
    }
  } catch (err) {
    return { success: false, message: `Google ìì²­ ì¤í¨: ${err.message}` };
  }
}

// âââââââââââââââââââââââââââââââââââââââââââââââ
// Bing URL Submission API
// âââââââââââââââââââââââââââââââââââââââââââââââ
async function submitToBing(url, siteUrl) {
  const config = await getConfig();
  if (!config.bingApiKey) {
    return { success: false, message: 'Bing API í¤ê° ì¤ì ëì§ ìììµëë¤.' };
  }

  try {
    const response = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${config.bingApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: siteUrl,
          url: url
        })
      }
    );

    if (response.ok) {
      return { success: true, message: 'Bing ìì¸ ìì²­ ì±ê³µ' };
    } else {
      const errorText = await response.text();
      return { success: false, message: `Bing API ì¤ë¥: ${errorText}` };
    }
  } catch (err) {
    return { success: false, message: `Bing ìì²­ ì¤í¨: ${err.message}` };
  }
}

// âââââââââââââââââââââââââââââââââââââââââââââââ
// ë¤ì´ë²/ë¤ì ë¸ë¼ì°ì  ìëí (Content Script íµì )
// âââââââââââââââââââââââââââââââââââââââââââââââ
async function submitViaContentScript(engine, url) {
  return new Promise((resolve) => {
    // ë°ë¡ ìì§ ìì²­ íì´ì§ë¡ ì´ë (content scriptìì íì´ì§ ì´ë ë¶íì)
    const webmasterUrls = {
      naver: 'https://searchadvisor.naver.com/console/crawl/request',
      daum: 'https://webmaster.daum.net/url-submission'
    };

    chrome.tabs.create({ url: webmasterUrls[engine], active: false }, (tab) => {
      let loadCount = 0;
      let messageSent = false;

      const listener = (tabId, info) => {
        if (tabId !== tab.id || info.status !== 'complete') return;
        loadCount++;

        // SPA ë¦¬ë¤ì´ë í¸ ë±ì¼ë¡ ì¬ë¬ë² ë¡ëë  ì ìì¼ë¯ë¡ ì²« ë²ì§¸ completeë§ ì²ë¦¬
        if (messageSent) return;
        messageSent = true;

        chrome.tabs.onUpdated.removeListener(listener);

        // DOM ìì í ëê¸° í ë©ìì§ ì ë¬ (5ì´ - ë¤ì´ë² SPA ë ëë§ ëê¸°)
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'submit_url',
            engine,
            url,
          }, (response) => {
            // chrome.runtime.lastError ì²´í¬ (content script ë¯¸ìëµ)
            if (chrome.runtime.lastError) {
              setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 1000);
              resolve({
                success: false,
                message: `${engine}: ì½íì¸  ì¤í¬ë¦½í¸ ìëµ ìì. ë¡ê·¸ì¸ ìíë¥¼ íì¸íì¸ì.`
              });
              return;
            }

            // í­ ë«ê¸°
            setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 2000);

            if (response?.success) {
              resolve({ success: true, message: response.message || `${engine} ìì¸ ìì²­ ì±ê³µ` });
            } else {
              resolve({
                success: false,
                message: response?.message || `${engine} ìì¸ ìì²­ ì¤í¨`
              });
            }
          });
        }, 5000);
      };

      chrome.tabs.onUpdated.addListener(listener);

      // íììì: 45ì´ (ë¤ì´ë² ë¡ë©ì´ ëë¦´ ì ìì)
      setTimeout(() => {
        if (!messageSent) {
          messageSent = true;
          chrome.tabs.onUpdated.removeListener(listener);
          chrome.tabs.remove(tab.id).catch(() => {});
          resolve({ success: false, message: `${engine} ìì¸ ìì²­ íììì` });
        }
      }, 45000);
    });
  });
}

// âââââââââââââââââââââââââââââââââââââââââââââââ
// ë©ì¸ ì²ë¦¬ ë£¨í
// âââââââââââââââââââââââââââââââââââââââââââââââ
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
      // ë¤ì URL ê°ì ¸ì¤ê¸°
      const queueResult = await getNextUrl(engine, siteId);

      if (queueResult.done) {
        broadcastStatus('completed', {
          engine,
          message: 'ëª¨ë  URL ì²ë¦¬ ìë£',
          processedCount
        });
        break;
      }

      const nextUrl = queueResult.next;
      broadcastStatus('processing', {
        engine,
        url: nextUrl.url,
        processedCount
      });

      // ìì¸ ìì²­ ë ì½ë ìì±
      const requestResult = await createIndexRequest(nextUrl.url_id, engine);

      if (requestResult.limit_reached) {
        broadcastStatus('limit_reached', {
          engine,
          message: requestResult.message,
          processedCount
        });
        break;
      }

      if (!requestResult.success) continue;

      const requestId = requestResult.request.id;

      // ìì§ë³ ìì¸ ìì²­ ì¤í
      let result;
      switch (engine) {
        case 'google':
          result = await submitToGoogle(nextUrl.url);
          break;
        case 'bing':
          result = await submitToBing(nextUrl.url, nextUrl.site_name);
          break;
        case 'naver':
        case 'daum':
          result = await submitViaContentScript(engine, nextUrl.url);
          break;
      }

      // ê²°ê³¼ ìë°ì´í¸
      await updateIndexRequest(
        requestId,
        result.success ? 'completed' : 'failed',
        result.message
      );

      processedCount++;

      // ëë ì´
      if (isProcessing) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (err) {
    broadcastStatus('error', {
      engine,
      message: err.message,
      processedCount
    });
  } finally {
    isProcessing = false;
    currentEngine = null;
    currentSiteId = null;
  }
}

function stopProcessing() {
  isProcessing = false;
  broadcastStatus('stopped', {
    engine: currentEngine,
    processedCount
  });
}

// ââ ìí ë¸ë¡ëìºì¤í¸ ââ
function broadcastStatus(status, data) {
  chrome.runtime.sendMessage({
    type: 'status_update',
    status,
    ...data
  }).catch(() => {}); // popupì´ ë«í ìì ë ìë¬ ë¬´ì

  // ìë¦¼ (ìë£, íë ëë¬, ìë¬)
  if (['completed', 'limit_reached', 'error'].includes(status)) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'SEO ìì¸ ê´ë¦¬ì',
      message: data.message || `${data.engine} ì²ë¦¬ ${status}`
    });
  }
}

// ── 메시지 핸들러 ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'start_indexing':
      processQueue(msg.engine, msg.siteId);
      sendResponse({ success: true });
      break;
    case 'stop_indexing':
      stopProcessing();
      sendResponse({ success: true });
      break;
    case 'get_status':
      sendResponse({
        isProcessing,
        engine: currentEngine,
        siteId: currentSiteId,
        processedCount
      });
      break;
    case 'get_config':
      getConfig().then(config => sendResponse(config));
      return true;
    case 'save_config':
      saveConfig(msg.config).then(() => sendResponse({ success: true }));
      return true;
    case 'test_connection':
      apiCall('/api/sites')
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, message: err.message }));
      return true;
    default:
      sendResponse({ error: 'Unknown action' });
  }
});
