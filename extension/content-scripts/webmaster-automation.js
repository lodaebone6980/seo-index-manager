// ═══════════════════════════════════════════════
// 네이버/다음 웹마스터 브라우저 자동화 Content Script
// ═══════════════════════════════════════════════

// 유틸리티: 대기
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 유틸리티: 엘리먼트 대기
async function waitForElement(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await wait(300);
  }
  return null;
}

// 유틼리티: 캡차 감지
function detectCaptcha() {
  const captchaIndicators = [
    'iframe[src*="captcha"]',
    'iframe[src*="recaptcha"]',
    '.captcha',
    '#captcha',
    '[class*="captcha"]',
    'img[src*="captcha"]',
  ];

  for (const selector of captchaIndicators) {
    if (document.querySelector(selector)) return true;
  }

  // 텍스트 기반 감지
  const bodyText = document.body.innerText;
  if (bodyText.includes('자동등록방지') || bodyText.includes('보안문자')) return true;

  return false;
}

// ═══════════════════════════════════════════════
// 네이버 서치어드바이저 자동화
// ═══════════════════════════════════════════════
async function submitToNaver(url) {
  try {
    // 네이버 서치어드바이저 "웹 페이지 수집" 페이지로 이동
    if (!window.location.href.includes('request/crawl')) {
      window.location.href = 'https://searchadvisor.naver.com/console/crawl/request';
      await wait(3000);
    }

    // 캡차 확인
    if (detectCaptcha()) {
      return {
        success: false,
        message: '네이버: 캡차가 감지되었습니다. 수동으로 처리해주세요.'
      };
    }

    // URL 입력 필드 찾기
    const inputField = await waitForElement('input[type="text"][placeholder*="URL"], input[name="url"], input.input_text, input[type="url"]');

    if (!inputField) {
      // 대체 방법: 모든 input 중 URL 입력 가능한 것 찾기
      const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
      let found = false;
      for (const input of allInputs) {
        const placeholder = input.getAttribute('placeholder') || '';
        if (placeholder.includes('URL') || placeholder.includes('url') || placeholder.includes('주소')) {
          input.value = url;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          found = true;
          break;
        }
      }
      if (!found) {
        return { success: false, message: '네이버: URL 입력 필드를 찾을 수 없습니다.' };
      }
    } else {
      inputField.focus();
      inputField.value = '';
      inputField.value = url;
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
      inputField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await wait(1000);

    // 확인/요청 버튼 찾기
    const submitBtn = await waitForElement(
      'button[type="submit"], button.btn_submit, button.btn_confirm, button:has-text("확인"), button:has-text("요청")'
    );

    if (!submitBtn) {
      // 대체 방법: 버튼 텍스트로 찾기
      const allButtons = document.querySelectorAll('button, a.btn, input[type="submit"]');
      let clicked = false;
      for (const btn of allButtons) {
        const text = btn.innerText || btn.value || '';
        if (text.includes('확인') || text.includes('요청') || text.includes('수집요청') || text.includes('등록')) {
          btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        return { success: false, message: '네이버: 제출 버튼을 찾을 수 없습니다.' };
      }
    } else {
      submitBtn.click();
    }

    await wait(2000);

    // 캡차 재확인
    if (detectCaptcha()) {
      return {
        success: false,
        message: '네이버: 색인 요청 후 캡차가 나타났습니다. 수동 처리가 필요합니다.'
      };
    }

    // 성공 메시지 확인
    const bodyText = document.body.innerText;
    if (bodyText.includes('완료') || bodyText.includes('성공') || bodyText.includes('접수')) {
      return { success: true, message: '네이버 색인 요청 완료' };
    }

    // 에러 메시지 확인
    if (bodyText.includes('이미 등록') || bodyText.includes('이미 요청')) {
      return { success: true, message: '네이버: 이미 등록된 URL입니다.' };
    }

    if (bodyText.includes('한도') || bodyText.includes('제한') || bodyText.includes('초과')) {
      return { success: false, message: '네이버: 일일 요청 한도에 도달했습니다.' };
    }

    return { success: true, message: '네이버 색인 요청 시도 완료 (결과 확인 필요)' };
  } catch (err) {
    return { success: false, message: `네이버 오류: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// 다음 웹마스터 자동화
// ═══════════════════════════════════════════════
async function submitToDaum(url) {
  try {
    // 다음 웹마스터 도구의 URL 수집 요청 페이지
    if (!window.location.href.includes('url-submission') && !window.location.href.includes('crawl')) {
      window.location.href = 'https://webmaster.daum.net/url-submission';
      await wait(3000);
    }

    // URL 입력 필드 찾기
    const inputField = await waitForElement('input[type="text"], input[type="url"], textarea');

    if (!inputField) {
      return { success: false, message: '다음: URL 입력 필드를 찾을 수 없습니다.' };
    }

    inputField.focus();
    inputField.value = '';
    inputField.value = url;
    inputField.dispatchEvent(new Event('input', { bubbles: true }));
    inputField.dispatchEvent(new Event('change', { bubbles: true }));

    await wait(1000);

    // 제출 버튼 찾기
    const allButtons = document.querySelectorAll('button, a.btn, input[type="submit"]');
    let clicked = false;
    for (const btn of allButtons) {
      const text = btn.innerText || btn.value || '';
      if (text.includes('확인') || text.includes('등록') || text.includes('요청') || text.includes('제출')) {
        btn.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      return { success: false, message: '다음: 제출 버튼을 찾을 수 없습니다.' };
    }

    await wait(2000);

    // 결과 확인
    const bodyText = document.body.innerText;

    if (bodyText.includes('한도') || bodyText.includes('제한') || bodyText.includes('초과') || bodyText.includes('더 이상')) {
      return { success: false, message: '다음: 일일 요청 한도에 도달했습니다.' };
    }

    if (bodyText.includes('완료') || bodyText.includes('성공') || bodyText.includes('접수')) {
      return { success: true, message: '다음 색인 요청 완료' };
    }

    if (bodyText.includes('이미')) {
      return { success: true, message: '다음: 이미 등록된 URL입니다.' };
    }

    return { success: true, message: '다음 색인 요청 시도 완료 (결과 확인 필요)' };
  } catch (err) {
    return { success: false, message: `다음 오류: ${err.message}` };
  }
}

// ── 메시지 리스너 ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'submit_url') {
    const handler = msg.engine === 'naver' ? submitToNaver : submitToDaum;
    handler(msg.url).then(result => sendResponse(result));
    return true; // async response
  }
});
