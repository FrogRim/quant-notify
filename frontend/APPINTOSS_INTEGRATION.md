# 앱인토스 SDK 통합 가이드

이 문서는 앱인토스 파트너 포털에서 SDK를 수령한 후 완료해야 할 통합 작업을 설명합니다.

## 1. SDK 패키지 설치

```bash
npm install @apps-in-toss/web-framework @toss/tds-mobile
npx ait init
```

## 2. TDS 스텁 컴포넌트 교체

현재 `src/components/tds/index.tsx`에 있는 스텁 컴포넌트를 실제 TDS로 교체합니다.

각 컴포넌트를 사용하는 파일에서:
```typescript
// 변경 전 (스텁)
import { Text, Button, Badge, ListRow, ProgressBar } from '../components/tds';

// 변경 후 (TDS)
import { Text, Button, Badge, ListRow, ProgressBar } from '@toss/tds-mobile';
```

영향받는 파일:
- `src/pages/Dashboard.tsx`
- `src/pages/Builder.tsx`
- `src/pages/History.tsx`
- `src/components/HarnessCard.tsx`
- `src/components/ConditionSlider.tsx`
- `src/components/SummaryCard.tsx`

교체 후 `src/components/tds/` 디렉토리 삭제 가능.

## 3. 앱인토스 로그인 SDK 연동

`src/main.tsx`에 앱인토스 로그인 초기화 추가:

```typescript
import { AppInToss } from '@apps-in-toss/web-framework';
import { setUserKey } from './api/client';

AppInToss.appLogin().then((result) => {
  setUserKey(result.userKey);
});
```

## 4. granite.config.ts 설정

```typescript
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'ai-investment-harness',
  brand: {
    displayName: 'AI 투자 하니스',
    primaryColor: '#3182F6',
    icon: null,
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: { dev: 'vite', build: 'vite build' },
  },
  permissions: [],
});
```

## 5. 빌드 및 번들

```bash
npm run build
npx ait bundle   # .ait 파일 생성 (최대 100MB)
```

## 6. 검수 전 체크리스트

### 필수 사항
- [ ] `user-scalable=no` meta 태그 (핀치 줌 금지) — `index.html`에 추가
- [ ] 네비게이션 바: 뒤로가기 + 닫기(X) 버튼
- [ ] 다크 모드 미구현 확인 (라이트 모드 전용)
- [ ] 테스트 광고 ID → 프로덕션 ID 교체
- [ ] mTLS 인증서 유효기간 확인 (390일)
- [ ] API 키 하드코딩 없음 확인
- [ ] TDS 컴포넌트 적용 확인
- [ ] 화면 로드 2초 이내 확인
- [ ] 접근성: 텍스트 대비 4.5:1 이상, 터치 타겟 44×44pt

### 다크패턴 방지
- [ ] 진입 시 바텀시트/팝업 즉시 표시 없음
- [ ] 뒤로가기 가로채기 없음 (이탈 방해 팝업 없음)
- [ ] 닫기 버튼 없는 팝업 없음
- [ ] 사용자 플로우 중 예상치 못한 광고 없음
- [ ] 모든 CTA 버튼 명확한 레이블 ("확인하기" → "하니스 시작하기" 등)

### CORS 설정 (백엔드)
백엔드 `server.ts`에 앱인토스 도메인이 이미 허용되어 있음:
- `https://*.apps.tossmini.com` (프로덕션)
- `https://*.private-apps.tossmini.com` (테스트)

### 환경변수 (백엔드 `.env`)
```
DATABASE_URL=postgresql://...
LLM_API_KEY=...
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=gpt-4o
KIS_WS_URL=ws://ops.koreainvestment.com:21000
KIS_APPROVAL_KEY=...
MTLS_CERT=/path/to/client-cert.pem
MTLS_KEY=/path/to/client-key.pem
```

### 환경변수 (프론트엔드 `.env`)
```
VITE_API_URL=https://your-backend-domain.com
```

## 7. 검수 프로세스 (영업일 2-3일)

| 단계 | 항목 |
|------|------|
| 1. 운영 검수 | 앱 정보, 서류 확인 |
| 2. 디자인 검수 | TDS 가이드라인 준수 |
| 3. 기능 검수 | 핵심 동작 QA |
| 4. 보안 검수 | XSS/CSRF/민감정보 암호화 |
