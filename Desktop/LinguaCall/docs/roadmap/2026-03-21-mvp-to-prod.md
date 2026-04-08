# LinguaCall — MVP → 실 서비스 전환 작업 기록

> **[ARCHIVAL]** 이 문서는 2026-03-21 기준 Clerk 기반 아키텍처 전환 작업 기록이다.
> 현재 프로덕션 스택은 Supabase Auth + VPS Docker Compose를 사용한다.
> 현재 구조는 `README.md` 및 `docs/architecture-overview.md`를 참고할 것.

**작성일**: 2026-03-21
**상태**: [ARCHIVAL] Clerk/Railway/Vercel 기반 — 현재 스택과 다름

---

## 배경

1차 MVP 완성 후 실 서비스 전환을 위한 보안·결제·모니터링·UX 강화 작업.

### 전환 전 주요 문제점

| 문제 | 위험도 |
|---|---|
| `x-clerk-user-id` 헤더에 임의 UUID 입력 가능 → 타인 데이터 접근 | 🔴 치명적 |
| 실제 결제 미연동 (mock provider만 존재) | 🟠 높음 |
| 서버 재시작 시 OTP 소멸 (메모리 저장) | 🟠 높음 |
| Rate Limiting 없음 | 🟠 높음 |
| 모니터링(Sentry) 없음 | 🟡 중간 |
| 법적 페이지(개인정보처리방침, 이용약관) 없음 | 🟡 중간 |
| `gpt-5.4-mini` (존재하지 않는 모델명) | 🟡 중간 |

---

## Phase 1 — Auth 보안 강화 ✅

### 변경 내용

**패키지 추가**
- `apps/web`: `@clerk/clerk-react ^5.0.0`
- `apps/api`: `@clerk/express ^1.0.0`

**API 미들웨어 (`apps/api/src/middleware/auth.ts`)**
```
Before: req.header("x-clerk-user-id") → 헤더 파싱만, 검증 없음
After:  getAuth(req).userId → @clerk/express JWT 서명 검증
```

**API 서버 (`apps/api/src/index.ts`)**
```typescript
app.use(clerkMiddleware()); // 전역 적용, 라우터보다 먼저
```

**Web Entry (`apps/web/src/main.tsx`)**
```typescript
<ClerkProvider publishableKey={VITE_CLERK_PUBLISHABLE_KEY}>
  <HashRouter><App /></HashRouter>
</ClerkProvider>
```

**UserContext (`apps/web/src/context/UserContext.tsx`)**
```
Before: localStorage UUID 생성 (dev-xxxxx)
After:  useAuth().userId + getToken() → JWT 발급
```

**API Client (`apps/web/src/lib/api.ts`)**
```
Before: apiClient(clerkUserId: string) → 'x-clerk-user-id': clerkUserId
After:  apiClient(getToken: () => Promise<string|null>) → Authorization: Bearer <jwt>
```

**Login 페이지 (`apps/web/src/pages/ScreenLogin.tsx`)**
```
Before: 수동 이름/이메일 폼
After:  <SignIn routing="hash" /> — Clerk 내장 UI (Google/Kakao OAuth 지원)
```

**업데이트된 페이지 목록**: ScreenVerify, ScreenSession, ScreenBilling, ScreenReport
→ 모두 `{ clerkUserId }` → `{ getToken }` 으로 교체

### 검증 방법
```bash
# 미인증 요청 → 401 확인
curl https://your-api.up.railway.app/sessions
# → {"ok":false,"error":{"code":"forbidden","message":"authentication required"}}

# 유효하지 않은 JWT → 401 확인
curl -H "Authorization: Bearer fake-jwt" https://your-api.up.railway.app/sessions
```

---

## Phase 2 — 프로덕션 하드닝 ✅

### 2-a. Rate Limiting

패키지: `express-rate-limit ^7.0.0` (apps/api)

| 엔드포인트 | 제한 |
|---|---|
| 전체 API | 분당 100회 |
| `POST /calls/initiate` | 분당 3회 |
| `POST /users/phone/start` | 분당 2회 |

제한 초과 시 → `429` + `{"code":"rate_limited",...}`

### 2-b. Phone OTP DB 영속화

**마이그레이션 파일**: `packages/db/migrations/20260321_phone_otp.sql`

```sql
CREATE TABLE phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

`apps/api/src/storage/inMemoryStore.ts`의 `otpChallenges: Map<>` 완전 제거
→ `startPhoneVerification` / `confirmPhoneVerification` 모두 DB 쿼리로 교체

### 2-c. 모델명 수정

```
Before: OPENAI_EVAL_MODEL=gpt-5.4-mini  (존재하지 않는 모델)
After:  OPENAI_EVAL_MODEL=gpt-4o-mini
```

`apps/api/.env.example` 수정 완료. Railway 환경변수도 동일하게 수정 필요.

### 2-d. CORS 강화

```
Before: app.use(cors()) — 모든 origin 허용
After:  ALLOWED_ORIGINS 환경변수로 허용 도메인 제한
```

설정 예시:
```
ALLOWED_ORIGINS=https://linguacall.vercel.app,https://linguacall-api.up.railway.app
```
비어있으면 개발환경에서는 모두 허용.

---

## Phase 3 — Toss Payments 연동 ✅ (코드)

### 추가된 엔드포인트

`POST /billing/toss/confirm`

```
요청: { paymentKey, orderId, amount }
처리: Toss API 검증 → store.handlePaymentWebhook() → 구독 활성화
응답: { ok: true, data: UserSubscription }
```

### 흐름
```
Frontend → Toss Payments Widget → paymentKey 수신
→ POST /billing/toss/confirm { paymentKey, orderId, amount }
→ API → https://api.tosspayments.com/v1/payments/confirm
→ 성공 시 → handlePaymentWebhook("payment.confirmed", "toss")
→ subscriptions 테이블 active 상태 업데이트
```

패키지: `@tosspayments/tosspayments-sdk ^2.0.0` (apps/web — 프론트 위젯용)

> **주의**: 프론트엔드 Toss Widget (`ScreenBilling.tsx`) 통합은 아직 미구현.
> Toss 사업자 등록 및 상점 ID 발급 후 진행 필요.

---

## Phase 5 — Sentry 모니터링 ✅

패키지:
- `apps/api`: `@sentry/node ^8.0.0`
- `apps/web`: `@sentry/react ^8.0.0`

**API** (`apps/api/src/index.ts`):
```typescript
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.2 });
app.use(Sentry.expressErrorHandler()); // 404 핸들러 이후에 등록
```

**Web** (`apps/web/src/main.tsx`):
```typescript
Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN });
<Sentry.ErrorBoundary fallback={<ErrorFallback />}>
  <ClerkProvider>...</ClerkProvider>
</Sentry.ErrorBoundary>
```

폴백 UI: "문제가 발생했습니다. 새로고침해주세요." + 새로고침 버튼

---

## Phase 6 — UX 개선 ✅

### 법적 페이지

| 파일 | 라우트 | 내용 |
|---|---|---|
| `ScreenPrivacy.tsx` | `/#/privacy` | 개인정보처리방침 (PIPA + GDPR) |
| `ScreenTerms.tsx` | `/#/terms` | 이용약관 |

`App.tsx` Footer에 두 링크 고정 표시.

---

## Phase 4 — Stripe 완성 (글로벌) ⏳

백엔드 골격은 이미 구현됨 (`billing.ts`의 webhook handler, provider routing).

남은 작업:
1. Stripe 대시보드 → Webhook 엔드포인트 등록
2. `STRIPE_SECRET_KEY`, `BILLING_WEBHOOK_SECRET_STRIPE` Railway 설정
3. 프론트엔드: Stripe Payment Link 또는 Elements 연동

---

## 외부 설정 작업 (코드 외)

### Clerk 대시보드
- [ ] 앱 생성 (Production 환경)
- [ ] Google OAuth 활성화
- [ ] Kakao OAuth 활성화 (한국 시장)
- [ ] 허용 도메인 설정 (Vercel 도메인)
- [ ] Publishable Key / Secret Key 복사

### Toss Payments
- [ ] 사업자 등록
- [ ] 상점 ID 발급
- [ ] Webhook URL 등록: `https://your-api.up.railway.app/billing/webhooks/toss`
- [ ] 테스트 키 → 프로덕션 키 전환

### Sentry
- [ ] 프로젝트 2개 생성 (Web, API)
- [ ] DSN 발급

### Railway 환경변수 추가
```
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
TOSS_CLIENT_KEY=live_ck_...
TOSS_SECRET_KEY=live_sk_...
SENTRY_DSN=https://...@o123456.ingest.sentry.io/...
ALLOWED_ORIGINS=https://linguacall.vercel.app
OPENAI_EVAL_MODEL=gpt-4o-mini
```

### Vercel 환경변수 추가
```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_SENTRY_DSN=https://...@o123456.ingest.sentry.io/...
```

### Supabase 마이그레이션 실행
```sql
-- packages/db/migrations/20260321_phone_otp.sql 실행
```

---

## 검증 체크리스트

- [ ] Clerk 미연동 요청 → `401` 반환
- [ ] 분당 요청 초과 → `429` 반환
- [ ] Toss 테스트 결제 완료 → `subscriptions` 테이블 `active` 확인
- [ ] 서버 재시작 후 OTP 인증 정상 동작 (DB 영속)
- [ ] Sentry 대시보드에서 테스트 에러 수신 확인
- [ ] React ErrorBoundary 폴백 UI 렌더링 확인
- [ ] `/#/privacy`, `/#/terms` 페이지 접근 확인
- [ ] Stripe Webhook 시뮬레이터 통과

---

## 관련 파일

- `apps/api/src/middleware/auth.ts` — Clerk JWT 검증
- `apps/api/src/index.ts` — 미들웨어 스택 (Sentry, CORS, Rate Limit, Clerk)
- `apps/api/src/routes/billing.ts` — Toss confirm 엔드포인트
- `apps/api/src/storage/inMemoryStore.ts` — OTP DB 영속화
- `packages/db/migrations/20260321_phone_otp.sql` — phone_verifications 테이블
- `apps/web/src/main.tsx` — ClerkProvider + Sentry ErrorBoundary
- `apps/web/src/context/UserContext.tsx` — JWT 기반 인증 컨텍스트
- `apps/web/src/lib/api.ts` — Bearer 토큰 API 클라이언트
- `apps/web/src/pages/ScreenPrivacy.tsx` — 개인정보처리방침
- `apps/web/src/pages/ScreenTerms.tsx` — 이용약관
- `apps/api/.env.example` — 전체 환경변수 목록
- `apps/web/.env.example` — 프론트 환경변수 목록
