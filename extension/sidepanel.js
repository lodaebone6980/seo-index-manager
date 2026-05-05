// ═══════════════════════════════════════════════
// Side Panel Controller - 통합 UI
// ═══════════════════════════════════════════════

let selectedEngine = null;

// ── 초기화 ──
document.addEventListener('DOMContentLoaded', async () => {
  const config = await sendMessage({ action: 'get_config' });
  document.getElementById('serverUrl').value = config.serverUrl || 'https://web-production-b7ac2.up.railway.app';
  document.getElementById('googleApiKey').value = config.googleApiKey || '';
  document.getElementById('bingApiKey').value = config.bingApiKey || '';
  document.getElementById('dashboardLink').href = config.serverUrl || 'https://web-production-b7ac2.up.railway.app';

  testConnection(config.serverUrl);
  loadSites(config.serverUrl);

  const status = await sendMessage({ action: 'get_status' });
  if (status && status.isProcessing) {
    showProcessingUI(status.currentEngine, status.processedCount);
  }
});

// ── 서버 설정 ──
document.getElementById('btnTest').addEventListener('click', () => {
  testConnection(document.getElementById('serverUrl').value.trim());
});

document.getElementById('btnSave').addEventListener('click', async () => {
  const config = {
    serverUrl: document.getElementById('serverUrl').value.trim(),
    googleApiKey: document.getElementById('googleApiKey').value.trim(),
    bingApiKey: document.getElementById('bingApiKey').value.trim(),
  };
  await sendMessage({ action: 'save_config', config });
  document.getElementById('dashboardLink').href = config.serverUrl;
  showMsg('configMsg', '저장 완료!', 'success');
  loadSites(config.serverUrl);
});

// ── 엔진 선택 ──
document.querySelectorAll('.engine-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedEngine = btn.dataset.engine;
  });
});

// ── 시작/중지 ──
document.getElementById('btnStart').addEventListener('click', async () => {
  if (!selectedEngine) { alert('엔진을 선택하세요.'); return; }
  const siteId = document.getElementById('siteSelect').value;
  if (!siteId) { alert('사이트를 선택하세요.'); return; }

  await sendMessage({
    action: 'start_indexing',
    engine: selectedEngine,
    siteId: parseInt(siteId)
  });
  showProcessingUI(selectedEngine, 0);
});

document.getElementById('btnStop').addEventListener('click', async () => {
  await sendMessage({ action: 'stop_indexing' });
  hideProcessingUI();
});

// ── 대시보드 링크 ──
document.getElementById('dashboardLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: document.getElementById('serverUrl').value.trim() });
});

// ── Background 상태 수신 ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'status_update') return;
  const statusText = document.getElementById('statusText');
  const statusCount = document.getElementById('statusCount');
  const statusUrl = document.getElementById('statusUrl');
  const totalCount = document.getElementById('totalCount');

  statusCount.textContent = msg.processedCount || 0;
  totalCount.textContent = msg.processedCount || 0;

  switch (msg.status) {
    case 'processing':
      statusText.textContent = (msg.engine || '').toUpperCase() + ' 색인 요청 중...';
      statusUrl.textContent = msg.url || '';
      break;
    case 'completed':
      statusText.textContent = '모든 URL 처리 완료!';
      statusUrl.textContent = '';
      hideProcessingUI();
      break;
    case 'limit_reached':
      statusText.textContent = msg.message || '일일 한도 도달';
      statusUrl.textContent = '';
      hideProcessingUI();
      break;
    case 'error':
      statusText.textContent = '오류: ' + msg.message;
      statusUrl.textContent = '';
      hideProcessingUI();
      break;
    case 'stopped':
      statusText.textContent = '중지됨';
      hideProcessingUI();
      break;
  }
});

// ═══════════════════════════════════════════════
// 헬퍼 함수
// ═══════════════════════════════════════════════
function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

async function testConnection(serverUrl) {
  const dot = document.getElementById('connectionDot');
  try {
    const result = await sendMessage({ action: 'test_connection', serverUrl });
    dot.className = 'dot ' + (result.connected ? 'connected' : 'disconnected');
    if (result.connected) {
      showMsg('configMsg', '서버 연결 성공!', 'success');
    } else {
      showMsg('configMsg', '연결 실패: ' + result.error, 'error');
    }
  } catch (err) {
    dot.className = 'dot disconnected';
    showMsg('configMsg', '연결 테스트 실패', 'error');
  }
}

async function loadSites(serverUrl) {
  try {
    const res = await fetch(serverUrl + '/api/sites');
    const sites = await res.json();
    const select = document.getElementById('siteSelect');
    select.innerHTML = '<option value="">사이트를 선택하세요...</option>';
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

function showProcessingUI(engine, count) {
  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnStop').style.display = 'flex';
  document.getElementById('statusBox').classList.add('show');
  document.getElementById('statusText').textContent = (engine || '').toUpperCase() + ' 색인 요청 중...';
  document.getElementById('statusCount').textContent = count || 0;
  document.getElementById('totalCount').textContent = count || 0;
}

function hideProcessingUI() {
  document.getElementById('btnStart').style.display = 'flex';
  document.getElementById('btnStop').style.display = 'none';
}

function showMsg(elementId, text, type) {
  const container = document.getElementById(elementId);
  container.innerHTML = '<div class="msg ' + type + '">' + text + '</div>';
  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

function toggleSection(id) {
  document.getElementById(id).classList.toggle('collapsed');
}
