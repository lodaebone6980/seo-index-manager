// ═══════════════════════════════════════════════
// Side Panel Controller - 네이버/다음 색인 요청
// ═══════════════════════════════════════════════

let selectedEngine = null;
let isProcessing = false;
let processedCount = 0;
let currentTabId = null;
let urlQueue = [];

// ── 초기화 ──
document.addEventListener('DOMContentLoaded', async () => {
  const config = await sendMessage({ action: 'get_config' });
  loadSites(config.serverUrl);
});

// ── 엔진 탭 선택 ──
document.querySelectorAll('.engine-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.engine-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedEngine = tab.dataset.engine;
    updateLoginNotice();
  });
});

// ── 로그인 링크 ──
document.getElementById('linkNaver').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://searchadvisor.naver.com/console/board' });
});

document.getElementById('linkDaum').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://webmaster.daum.net/board' });
});

// ── 시작 버튼 ──
document.getElementById('btnStart').addEventListener('click', async () => {
  if (!selectedEngine) {
    alert('엔진을 선택하세요 (네이버 또는 다음)');
    return;
  }
  const siteId = document.getElementById('siteSelect').value;
  if (!siteId) {
    alert('사이트를 선택하세요.');
    return;
  }

  startProcessing(siteId);
});

// ── 중지 버튼 ──
document.getElementById('btnStop').addEventListener('click', () => {
  stopProcessing();
});

// ═══════════════════════════════════════════════
// 메인 처리 로직
// ═══════════════════════════════════════════════
async function startProcessing(siteId) {
  isProcessing = true;
  processedCount = 0;
  urlQueue = [];

  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnStop').style.display = 'inline-block';
  document.getElementById('statusBar').classList.add('show');
  document.getElementById('loginNotice').style.display = 'none';

  const config = await sendMessage({ action: 'get_config' });
  const delay = selectedEngine === 'naver' ? 5000 : 4000;

  updateStatus('웹마스터 도구 열기...', 0);

  // 웹마스터 도구 탭 열기
  const webmasterUrl = selectedEngine === 'naver'
    ? 'https://searchadvisor.naver.com/console/crawl/request'
    : 'https://webmaster.daum.net/url-submission';

  const tab = await chrome.tabs.create({ url: webmasterUrl, active: true });
  currentTabId = tab.id;

  // 페이지 로드 대기
  await waitForTabLoad(currentTabId);
  await sleep(3000);

  updateStatus('URL 큐 가져오는 중...', 0);

  // 처리 루프
  while (isProcessing) {
    // 다음 URL 가져오기
    const config = await sendMessage({ action: 'get_config' });
    let queueResult;
    try {
      const res = await fetch(config.serverUrl + '/api/queue/' + selectedEngine + '?site_id=' + siteId);
      queueResult = await res.json();
    } catch (err) {
      updateStatus('서버 연결 실패: ' + err.message, processedCount);
      break;
    }

    if (queueResult.done) {
      updateStatus('모든 URL 처리 완료!', processedCount);
      addQueueItem('완료', '모든 URL 처리 완료', 'done');
      break;
    }

    const nextUrl = queueResult.next;
    const urlText = nextUrl.url;

    updateStatus(selectedEngine.toUpperCase() + ' 색인 요청 중...', processedCount, urlText);
    addQueueItem('active', urlText, 'active');

    // 색인 요청 레코드 생성
    let requestResult;
    try {
      const res = await fetch(config.serverUrl + '/api/index-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_id: nextUrl.url_id, engine: selectedEngine })
      });
      requestResult = await res.json();
    } catch (err) {
      markLastItem('failed');
      continue;
    }

    if (requestResult.limit_reached) {
      updateStatus(requestResult.message || '일일 한도 도달', processedCount);
      markLastItem('failed');
      break;
    }

    if (!requestResult.success) {
      markLastItem('failed');
      continue;
    }

    const requestId = requestResult.request.id;

    // Content Script로 URL 제출
    let result;
    try {
      result = await sendToContentScript(currentTabId, selectedEngine, urlText);
    } catch (err) {
      result = { success: false, message: err.message };
    }

    // 결과 업데이트
    try {
      await fetch(config.serverUrl + '/api/index-request/' + requestId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: result.success ? 'completed' : 'failed',
          message: result.message
        })
      });
    } catch (err) {}

    if (result.success) {
      processedCount++;
      markLastItem('done');
    } else {
      markLastItem('failed');
      // 캡차 감지 시 일시 정지
      if (result.message && result.message.includes('캡차')) {
        updateStatus('캡차 감지! 수동 해결 후 다시 시작해주세요.', processedCount);
        break;
      }
    }

    document.getElementById('processedTotal').textContent = processedCount;
    document.getElementById('statusCount').textContent = processedCount;

    // 딜레이
    if (isProcessing) {
      await sleep(delay);
    }
  }

  stopProcessingUI();
}

function stopProcessing() {
  isProcessing = false;
  updateStatus('중지됨', processedCount);
  stopProcessingUI();
}

function stopProcessingUI() {
  isProcessing = false;
  document.getElementById('btnStart').style.display = 'inline-block';
  document.getElementById('btnStop').style.display = 'none';
}

// ═══════════════════════════════════════════════
// Content Script 통신
// ═══════════════════════════════════════════════
function sendToContentScript(tabId, engine, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'submit_url',
      engine: engine,
      url: url
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response) {
        resolve(response);
      } else {
        reject(new Error('응답 없음'));
      }
    });

    // 20초 타임아웃
    setTimeout(() => reject(new Error('타임아웃')), 20000);
  });
}

// ═══════════════════════════════════════════════
// 헬퍼 함수들
// ═══════════════════════════════════════════════
function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

async function loadSites(serverUrl) {
  try {
    const res = await fetch(serverUrl + '/api/sites');
    const sites = await res.json();
    const select = document.getElementById('siteSelect');
    select.innerHTML = '<option value="">사이트 선택...</option>';
    sites.forEach(site => {
      const opt = document.createElement('option');
      opt.value = site.id;
      opt.textContent = site.name + ' (' + (site.url_count || 0) + ' URLs)';
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('사이트 로드 실패:', err);
  }
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateStatus(msg, count, url) {
  document.getElementById('statusMsg').textContent = msg;
  document.getElementById('statusCount').textContent = count || 0;
  document.getElementById('currentUrl').textContent = url || '';
  document.getElementById('processedTotal').textContent = count || 0;
}

function updateLoginNotice() {
  const notice = document.getElementById('loginNotice');
  if (selectedEngine === 'naver') {
    notice.innerHTML = '<p>네이버 서치어드바이저에 로그인되어 있어야 합니다.</p>' +
      '<p style="margin-top:8px;"><a href="#" id="linkNaverOpen">네이버 서치어드바이저 열기 →</a></p>';
    document.getElementById('linkNaverOpen').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://searchadvisor.naver.com/console/crawl/request' });
    });
  } else if (selectedEngine === 'daum') {
    notice.innerHTML = '<p>다음 웹마스터도구에 로그인되어 있어야 합니다.</p>' +
      '<p style="margin-top:8px;"><a href="#" id="linkDaumOpen">다음 웹마스터도구 열기 →</a></p>';
    document.getElementById('linkDaumOpen').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://webmaster.daum.net/url-submission' });
    });
  }
}

function addQueueItem(icon, url, status) {
  const list = document.getElementById('queueList');
  // 첫 아이템일 때 빈 상태 제거
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const icons = { active: '⏳', done: '✅', failed: '❌' };
  const item = document.createElement('div');
  item.className = 'queue-item ' + status;
  item.innerHTML = '<span class="icon">' + (icons[status] || '⏳') + '</span><span class="url">' + url + '</span>';
  item.id = 'queue-item-' + Date.now();
  list.insertBefore(item, list.firstChild);
  window._lastItemId = item.id;
}

function markLastItem(status) {
  if (!window._lastItemId) return;
  const item = document.getElementById(window._lastItemId);
  if (!item) return;
  const icons = { done: '✅', failed: '❌' };
  item.className = 'queue-item ' + status;
  item.querySelector('.icon').textContent = icons[status] || '⏳';
}
