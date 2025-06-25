# Proof of Stars Chrome Extension - 설치 가이드

## 🚀 빠른 시작

### 1. Chrome 익스텐션 설치

1. Chrome 브라우저에서 `chrome://extensions/` 접속
2. 우측 상단의 "개발자 모드" 토글 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 버튼 클릭
4. 이 프로젝트 폴더 선택

### 2. 초기 데이터 다운로드

1. 익스텐션 아이콘 클릭하여 팝업 열기
2. "Update Data" 버튼 클릭
3. 25,000등까지의 랭킹 데이터 다운로드 대기 (약 1-2분)
4. 다운로드 완료 후 "Ready" 상태 확인

### 3. 트위터에서 테스트

1. 트위터(X) 웹사이트 접속: https://twitter.com
2. 프로필에 랭킹 뱃지가 표시되는지 확인
3. 테스트용 사용자명들:
   - `elonmusk` (1위)
   - `billgates` (2위)
   - `sundarpichai` (3위)
   - `satyanadella` (15위)
   - `timcook` (25위)
   - `markzuckerberg` (45위)
   - `jack` (120위)

## 🔧 상세 설정

### 캐시 시스템

익스텐션은 **IndexedDB**를 사용하여 25,000등까지의 랭킹 데이터를 로컬에 저장합니다:

- **저장 용량**: 약 2-3MB
- **자동 업데이트**: 24시간마다 자동 갱신
- **수동 업데이트**: 팝업에서 "Update Data" 버튼
- **쿨다운**: 24시간 쿨다운으로 서버 부하 방지

### 팝업 UI 기능

- **캐시 상태**: "Ready" 또는 "Need Initialization"
- **캐시된 데이터**: 현재 저장된 랭킹 수 (예: 25,000 / 25,000)
- **마지막 업데이트**: 마지막 데이터 갱신 시간
- **Show Badges 토글**: 뱃지 표시/숨김 기능
- **Update Data 버튼**: 수동 데이터 갱신 (24시간 쿨다운 적용)

### 뱃지 제어

- **Show Badges 토글**: 뱃지 표시 여부를 실시간으로 제어
- **즉시 적용**: 토글 변경 시 모든 트위터 탭에 즉시 반영
- **설정 저장**: 브라우저 재시작 후에도 설정 유지

## 🐛 문제 해결

### 뱃지가 표시되지 않는 경우

1. **캐시 상태 확인**
   - 익스텐션 팝업에서 "Cache Status" 확인
   - "Need Initialization"인 경우 "Update Data" 클릭

2. **뱃지 토글 확인**
   - "Show Badges" 토글이 켜져 있는지 확인
   - 토글을 끄고 다시 켜서 새로고침

3. **개발자 도구 확인**
   - F12 키를 눌러 개발자 도구 열기
   - Console 탭에서 에러 메시지 확인

4. **IndexedDB 확인**
   - 개발자 도구 > Application > Storage > IndexedDB
   - `ProofOfStarsDB` 데이터베이스 확인

### 데이터 다운로드 실패

1. **네트워크 연결 확인**
   - 인터넷 연결 상태 확인
   - API 서버 접근 가능 여부 확인

2. **쿨다운 확인**
   - 팝업에서 쿨다운 시간 확인
   - 24시간 대기 후 재시도

3. **브라우저 권한 확인**
   - `chrome://extensions/`에서 익스텐션 권한 확인
   - "unlimitedStorage" 권한이 있는지 확인

### 캐시 초기화

필요한 경우 캐시를 완전히 초기화할 수 있습니다:

1. 개발자 도구 > Application > Storage > IndexedDB
2. `ProofOfStarsDB` 데이터베이스 삭제
3. 익스텐션 팝업에서 "Update Data" 클릭

## 📊 랭킹 시스템

### 뱃지 스타일

- **핑크 배경**: 브랜드 컬러인 핑크 테마
- **랭킹 표시**: "1st", "2nd", "3rd" 등의 서수 형태
- **스타 아이콘**: SVG 스타 아이콘과 스타 수량 표시
- **반응형**: 트위터 피드와 프로필 페이지에서 일관된 크기

### 랭킹 데이터 형식

```json
{
  "username": "username",
  "rank": 15,
  "stars": 12500,
  "proofs": 45,
  "cycles": 1500000,
  "category": "succinct",
  "lastUpdated": "2024-01-15T10:30:00Z"
}
```

## 🔄 업데이트

### 익스텐션 업데이트

1. 코드 수정 후 `chrome://extensions/`에서 "새로고침" 버튼 클릭
2. 트위터 페이지 새로고침

### 자동 업데이트

- **24시간마다 자동**: 백그라운드에서 자동으로 데이터 갱신
- **수동 업데이트**: 팝업에서 "Update Data" 버튼 클릭
- **쿨다운 시스템**: 24시간 쿨다운으로 서버 부하 방지

## 🎯 고급 기능

### API 서버 배포

자체 API 서버를 사용하려면:

1. `api/index.js` 파일 수정
2. Vercel에 배포:
   ```bash
   npm i -g vercel
   vercel --prod
   ```

### 뱃지 스타일 커스터마이징

`styles.css` 파일을 수정하여 뱃지 스타일을 변경할 수 있습니다.

### 캐시 성능 최적화

- **배치 처리**: 대량 데이터 효율적 저장
- **지연 로딩**: 필요할 때만 데이터 조회
- **에러 처리**: 네트워크 오류 시 기존 캐시 사용

## 📝 로그 확인

### 콘솔 로그

브라우저 개발자 도구 > Console에서 로그 확인:

```
Proof of Stars extension installed.
IndexedDB 초기화 완료
25,000등까지의 랭킹 데이터 다운로드 시작...
25000개의 랭킹 데이터 캐시 완료
```

### 백그라운드 로그

`chrome://extensions/` > 익스텐션 세부정보 > "백그라운드 페이지 검사"에서 로그 확인

### IndexedDB 데이터 확인

1. 개발자 도구 > Application > Storage > IndexedDB
2. `ProofOfStarsDB` > `rankings` 스토어 확인
3. 저장된 랭킹 데이터 개수 및 내용 확인

## 🚨 주의사항

- **초기 다운로드**: 첫 실행 시 25,000등 데이터 다운로드로 시간 소요 (1-2분)
- **저장 공간**: 약 2-3MB의 로컬 저장 공간 사용
- **네트워크**: 초기 다운로드와 자동 업데이트 시 인터넷 연결 필요
- **트위터 UI 변경**: 트위터의 UI 변경 시 익스텐션 업데이트 필요
- **브라우저 지원**: Chrome 88+ 이상 필요 (IndexedDB 지원)
- **쿨다운**: 수동 업데이트는 24시간 쿨다운 적용

## 🔧 개발자 정보

### 기술 스택

- **Chrome Extension Manifest V3**
- **IndexedDB**: 대용량 랭킹 데이터 저장
- **Service Worker**: 백그라운드 데이터 관리
- **Vercel Serverless Functions**: API 서버

### 파일 구조

```
├── manifest.json          # 익스텐션 매니페스트
├── content.js             # 콘텐츠 스크립트 (뱃지 표시)
├── background.js          # 백그라운드 서비스 워커 (IndexedDB 관리)
├── popup.html             # 팝업 UI (캐시 상태 표시)
├── popup.js               # 팝업 로직 (업데이트 관리)
├── styles.css             # 뱃지 스타일
├── api/index.js           # API 서버 (Vercel)
└── icons/                 # 익스텐션 아이콘
``` 