// ═══════════════════════════════════════════════
// Popup UI Controller
// ═══════════════════════════════════════════════

let selectedEngine = null;

// ── 초기화 ──
document.addEventListener('DOMContentLoaded', async () => {
  // 저장된 설정 불러오기
  const config = await sendMessage({ action: 'get_config' });
  document.getElementById('serverUrl').value = config.serverUrl || 'https://web-production-b7ac2.up.railway.app';
  document.getElementById('googleApiKey').value = config.googleApiKey || '';
  document.getElementById('bingApiKey').value = config.bingApiKey || '';
  document.getElementById('dashboardLink').href = config.serverUrl || 'https://web-production-b7ac2.up.railway.app';

  // 연결 테스트
  testConnection(config.serverUrl);

  // 현재 진행 상태 확인
  const status = await sendMessage({ action: 'get_status' });
  if (status.isProcessing) {
    showProcessingUI(status.currentEngine, status.processedCount);
  }

  // 사이트 목록 불러오기
  loadSites(config.serverUrl);
});

// ── 이벤트 리스너 ──

// 연결 테스트
document.getElementById('btnTestConnection').addEventListener('click', () => {
  const serverUrl = document.getElementById('serverUrl').value.trim();
  testConnection(serverUrl);
});

// 설정 저장
document.getElementById('btnSaveConfig').addEventListener('click', async () => {
  const config = {
    serverUrl: document.getElementById('serverUrl').value.trim(),
    googleApiKey: document.getElementById('googleApiKey').value.trim(),
    bingApiKey: document.getElementById('bingApiKey').value.trim(),
  };

  await sendMessage({ action: 'save_config', config });
  document.getElementById('dashboardLink').href = config.serverUrl;
  showMsg('connectionMsg', '설정이 저장되었습니다.', 'success');
  loadSites(config.serverUrl);
});

// 엔진 선택
document.querySelectorAll('.engine-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedEngine = btn.dataset.engine;
  });
});

// 시작 버튼
document.getElementById('btnStart').addEventListener('click', async () => {
  if (!selectedEngine) {
    alert('엔진을 선택하세요.');
    return;
  }

  const siteId = document.getElementById('siteSelect').value;
  if (!siteId) {
    alert('사이트를 선택하세요.');
    return;
  }

  await sendMessage({
    action: 'start_indexing',
    engine: selectedEngine,
    siteId: parseInt(siteId)
  });

  showProcessingUI(selectedEngine, 0);
});

// 중지 버튼
document.getElementById('btnStop').addEventListener('click', async () => {
  await sendMessage({ action: 'stop_indexing' });
  hideProcessingUI();
});

// 대시보드 링크
document.getElementById('dashboardLink').addEventListener('click', (e) => {
  e.preventDefault();
  const url = document.getElementById('serverUrl').value.trim();
  chrome.tabs.create({ url });
});

// ── Background 상태 수신 ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'status_update') return;

  const statusText = document.getElementById('statusText');
  const statusCount = document.getElementById('statusCount');
  const statusUrl = document.getElementById('statusUrl');

  statusCount.textContent = msg.processedCount || 0;

  switch (msg.status) {
    case 'processing':
      statusText.textContent = `${msg.engine?.toUpperCase()} 색인 요청 중...`;
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
      statusText.textContent = `오류: ${msg.message}`;
      statusUrl.textContent = '';
      hideProcessingUI();
      break;

    case 'stopped':
      statusText.textContent = '중지됨';
      hideProcessingUI();
      break;
  }
});

// ── 헬퍼 함수 ──

function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

async function testConnection(serverUrl) {
  const dot = document.getElementById('connectionDot');
  try {
    const result = await sendMessage({ action: 'test_connection', serverUrl });
    dot.className = `dot ${result.connected ? 'connected' : 'disconnected'}`;
    if (result.connected) {
      showMsg('connectionMsg', '서버 연결 성공!', 'success');
    } else {
      showMsg('connectionMsg', `연결 실패: ${result.error}`, 'error');
    }
  } catch (err) {
    dot.className = 'dot disconnected';
    showMsg('connectionMsg', '연결 테스트 실패', 'error');
  }
}

async function loadSites(serverUrl) {
  try {
    const res = await fetch(`${serverUrl}/api/sites`);
    const sites = await res.json();
    const select = document.getElementById('siteSelect');
    select.innerHTML = '<option value="">사이트를 선택하세요...</option>';
    sites.forEach(site => {
      const opt = document.createElement('option');
      opt.value = site.id;
      opt.textContent = `${site.name} (${site.url_count || 0} URLs)`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('사이트 로드 실패:', err);
  }
}

function showProcessingUI(engine, count) {
  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnStop').style.display = 'block';
  document.getElementById('statusBox').style.display = 'block';
  document.getElementById('statusText').textContent = `${engine?.toUpperCase()} 색인 요청 중...`;
  document.getElementById('statusCount').textContent = count || 0;
}

function hideProcessingUI() {
  document.getElementById('btnStart').style.display = 'block';
  document.getElementById('btnStop').style.display = 'none';
}

function showMsg(elementId, text, type) {
  const container = document.getElementById(elementId);
  container.innerHTML = `<div class="msg ${type}">${text}</div>`;
  setTimeout(() => { container.innerHTML = ''; }, 5000);
}
