// ═══════════════════════════════════════════════
// 네이버/다음 웸마스터 브라우저 자동화 Content Script
// ═══════════════════════════════════════════════

// 유틸리티: 대기
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 유틸리티: 엘리먼트 대기 (여러 셀렉터 지�)
async function waitForElement(selectors, timeout = 15000) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const selector of selectorList) {
      try {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) return el; // 보이는 요소만
      } catch (e) { /* 잘못된 셀렉터 무시 */ }
    }
    await wait(500);
  }
  return null;
}

// 유틸리티: 텍스트로 버튼 찾기
function findButtonByText(...keywords) {
  const allButtons = document.querySelectorAll('button, a.btn, input[type="submit"], [role="button"]');
  for (const btn of allButtons) {
    const text = (btn.innerText || btn.value || '').trim();
    for (const keyword of keywords) {
      if (text.includes(keyword)) return btn;
    }
  }
  return null;
}

// 유틸리티: 텍스트로 input 찾기
function findInputByPlaceholder(...keywords) {
  const allInputs = document.querySelectorAll('input[type="text"], input[type="url"], input:not([type]), textarea');
  for (const input of allInputs) {
    const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    for (const keyword of keywords) {
      if (placeholder.includes(keyword) || ariaLabel.includes(keyword)) return input;
    }
  }
  // 못 찾으면 첫 번째 보이는 text input 반환
  for (const input of allInputs) {
    if (input.offsetParent !== null && input.type !== 'hidden') return input;
  }
  return null;
}

// 유틸리티: React/Vue input에 값 설정
function setInputValue(input, value) {
  // 네이티브 setter 사용 (React 호환)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  const setter = input.tagName === 'TEXTAREA' ? nativeTextAreaValueSetter : nativeInputValueSetter;

  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }

  // 모든 관련 이벤트 발생
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

// 유틸리티: 캡차 감지
function detectCaptcha() {
  const captchaIndicators = [
    'iframe[src*="captcha"]',
    'iframe[src*="recaptcha"]',
    '.captcha', '#captcha',
    '[class*="captcha"]',
    'img[src*="captcha"]',
  ];

  for (const selector of captchaIndicators) {
    if (document.querySelector(selector)) return true;
  }

  const bodyText = document.body.innerText;
  if (bodyText.includes('자동등록방지') || bodyText.includes('보안문자')) return true;

  return false;
}

// ═══════════════════════════════════════════════
// 네이버 서치어드바이저 자동화
// ═══════════════════════════════════════════════
async function submitToNaver(url) {
  try {
    console.log('[SEO] 네이버 색인 요청 시작:', url);

    // 로그인 확인 - 로그인 페이지로 리다이렉트되었는지 체크
    await wait(2000);
    if (window.location.href.includes('login') || window.location.href.includes('nid.naver.com')) {
      return {
        success: false,
        message: '네이버: 로그인이 필요합니다. 네이버 서치어드바이저에 먼저 로그인하세요.'
      };
    }

    // 캡차 확인
    if (detectCaptcha()) {
      return {
        success: false,
        message: '네이버: 캡차가 감지되었습니다. 수동으로 처리해주세요.'
      };
    }

    // URL 입력 필드 찾기 (여러 방법 시도)
    console.log('[SEO] URL 입력 필드 찾는 중...');
    let inputField = await waitForElement([
      'input[type="text"][placeholder*="URL"]',
      'input[type="text"][placeholder*="url"]',
      'input[type="url"]',
      'input[name="url"]',
      'input.input_text',
    ], 10000);

    if (!inputField) {
      inputField = findInputByPlaceholder('url', '주소', 'http');
    }

    if (!inputField) {
      console.log('[SEO] URL 입력 필드를 찾을 수 없음. 페이지 HTML:', document.body.innerHTML.substring(0, 500));
      return { success: false, message: '네이버: URL 입력 필드를 찾을 수 없습니다. 페이지를 확인하세요.' };
    }

    console.log('[SEO] 입력 필드 발견, URL 입력 중...');
    inputField.focus();
    inputField.click();
    await wait(300);
    setInputValue(inputField, url);
    await wait(1500);

    // 확인/요청 버트 찾기
    console.log('[SEO] 제출 버튼 찾는 중...');
    let submitBtn = findButtonByText('확인', '요청', '수집요청', '등록', '수집');

    if (!submitBtn) {
      // CSS 셀렉터로 시도
      submitBtn = document.querySelector('button[type="submit"], button.btn_submit, button.btn_confirm');
    }

    if (!submitBtn) {
      return { success: false, message: '네이버: 제출 버튼을 찾을 수 없습니다.' };
    }

    console.log('[SEO] 버튼 클릭:', submitBtn.innerText || submitBtn.value);
    submitBtn.click();
    await wait(3000);

    // 캡차 재확인
    if (detectCaptcha()) {
      return {
        success: false,
        message: '네이버: 색인 요청 후 캡차가 나타났습니다. 수동 처리가 필요합니다.'
      };
    }

    // 결과 확인 - 페이지 텍스트 분석
    const bodyText = document.body.innerText;

    // 에러 메시지 먼저 확인
    if (bodyText.includes('한도') || bodyText.includes('제한') || bodyText.includes('초과')) {
      return { success: false, message: '네이버: 일일 요청 한도에 도단했습니다.' };
    }

    if (bodyText.includes('이미 등록') || bodyText.includes('이미 요청')) {
      return { success: true, message: '네이버: 이미 등록된 URL입니다.' };
    }

    if (bodyText.includes('완료') || bodyText.includes('성공') || bodyText.includes('접수')) {
      return { success: true, message: '네이버 색인 요청 완료' };
    }

    // 알 수 없는 결과 - 로그 남기고 성공으로 처리
    console.log('[SEO] 결과 텍스트:', bodyText.substring(0, 300));
    return { success: true, message: '네이버 색인 요청 시도 완료 (결과 확인 필요)' };
  } catch (err) {
    console.error('[SEO] 네이버 오류:', err);
    return { success: false, message: `네이버 오류: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// 다음 웹마스터 자동화
// ═══════════════════════════════════════════════
async function submitToDaum(url) {
  try {
    console.log('[SEO] 다음 색인 요청 시작:', url);

    await wait(2000);

    // 로그인 확인
    if (window.location.href.includes('login') || window.location.href.includes('accounts.kakao')) {
      return {
        success: false,
        message: '다음: 로그인이 필요합니다. 다음 웹마스터에 먼저 로그인하세요.'
      };
    }

    // URL 입력 필드 찾기
    let inputField = await waitForElement([
      'input[type="text"]',
      'input[type="url"