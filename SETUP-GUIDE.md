# SEO 색인 요청 관리자 - 설정 가이드

## 프로젝트 구조

```
seo-index-manager/
├── server.js                 # Express.js 백엔드 (API + 정적 파일 서빙)
├── src/                      # React 프론트엔드
│   ├── App.jsx               # 메인 앱 (라우팅, 사이드바)
│   └── pages/
│       ├── Dashboard.jsx     # 대시보드 (통계, 차트, 최근 활동)
│       ├── Sites.jsx         # 사이트 관리 (추가/삭제)
│       ├── SiteDetail.jsx    # 사이트 상세 (URL 목록, 엔진별 색인 상태)
│       └── Settings.jsx      # 설정 (일일 한도, 서버 URL, 옵시디얈 안내)
├── extension/                # 크롬 확장프로그램
│   ├── manifest.json
│   ├── background.js         # Google/Bing API 호출 + 작업 큐 관리
│   ├── popup.html/js         # 팝업 UI (사이트/엔진 선택, 시작/중지)
│   └── content-scripts/
│       └── webmaster-automation.js  # 네이버/다음 브라우저 자동화
├── railway.json              # Railway 배포 설정
├── Procfile                  # Railway 프로세스 설정
└── package.json
```

## 1단계: 로컬 개발 환경 설정

```bash
# 프로젝트 폴더로 이동
cd seo-index-manager

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에서 DATABASE_URL을 실제 PostgreSQL 주소로 변경

# 개발 서버 실행
npm run dev:all
# 또는 별도로: npm run dev (프론트) + npm run dev:server (백엔드)
```

## 2단계: GitHub에 올리기

```bash
git init
git add .
git commit -m "Initial commit - SEO 색인 요청 관리자"
gh repo create seo-index-manager --public --source=. --push
# 또는 수동으로:
# git remote add origin https://github.com/<YOUR_USERNAME>/seo-index-manager.git
# git push -u origin main
```

## 3단계: Railway 배포

1. [railway.app](https://railway.app) 접속 후 로그인
2. "New Project" → "Deploy from GitHub repo" 선택
3. 방금 올린 GitHub 저장소 선택
4. PostgreSQL 추가:
   - 프로젝트 대시보드에서 "+ New" → "Database" → "PostgreSQL"
   - 앱 서비스 Variables 탭에서 추가:
     ```
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     NODE_ENV=production
     ```
5. Settings → Domains에서 공개 도메인 생성
6. 배포 완료 후 해당 URL로 접속하여 대시보드 확인

## 4단계: 크롬 확장프로그램 설치

1. Chrome에서 `chrome://extensions/` 접속
2. 우측 상단 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `extension/` 폴더 선택
5. 확장프로그램 팝업에서:
   - 서버 URL을 Railway 배포 URL로 설정 (예: `https://your-app.up.railway.app`)
   - Google Indexing API Key 입력 (선택)
   - Bing Webmaster API Key 입력 (선택)
   - "연결 테스트" 클릭하여 연결 확인

## 5단계: 사용 방법

### 사이트 등록 & URL 추출
1. 대시보드 → 사이트 관리 → "사이트 추가"
2. 사이트 이름, URL 입력 (Sitemap/RSS는 비워두면 자동 감지)
3. 사이트 상세 페이지에서 "URL 추출" 버튼 클릭
4. Sitemap/RSS에서 모든 URL이 자동 추출됨

### 색인 요청 실행
1. 크롬 확장프로그램 아이콘 클릭
2. 사이트 선택
3. 엔진 선택 (Google, Bing, Naver, Daum)
4. "색인 요청 시작" 클릭
5. 진행 상황은 팝업에서 실시간 확인 가능

### 진행 상황 모니터링
- **대시보드**: 전체 통계, 엔진별 현황, 일일 한도, 최근 활동
- **사이트 상세**: URL별 엔진 색인 상태 (체크 아이콘)
- **옵시디언**: 사이드바 "옵시디언 내보내기" → .md 파일 다운로드 → 보트에 저장

## API 키 발급 방법

### Google Indexing API
1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 프로젝트 생성 → API 라이브러리에서 "Indexing API" 활성화
3. 사용자 인증 정보 → API 키 생성
4. Google Search Console에서 사이트 소유권 확인 필요

### Bing Webmaster API
1. [Bing Webmaster Tools](https://www.bing.com/webmasters) 접속
2. 사이트 등록 후 소유권 확인
3. 설정 → API 키에서 발급

## 주의사항

- **네이버**: 캡차가 나타날 수 있으므로 5초 딜레이 적용됨. 캡차 발생 시 수동 처리 필요
- **다음**: 일일 색인 요청 한도가 매우 적음 (약 20건). 한도 초과 시 자동 중지
- **Google**: Indexing API 일일 한도 약 200건
- **Bing**: URL Submission API 일일 한도 약 100건
- 각 엔진의 일일 한도는 설정 페이지에서 조정 가능

## 옵시디언 자동 동기화 (선택)

매시간 자동으로 옵시디언에 업데이트하려면 cron 설정:
```bash
# crontab -e
0 * * * * curl -s https://your-app.up.railway.app/api/export/obsidian > /path/to/obsidian-vault/SEO-Index-Status.md
```
