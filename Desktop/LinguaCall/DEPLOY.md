# LinguaCall 배포 가이드

외부 테스터가 접속할 수 있는 상태로 배포하는 절차.

**구조: Supabase (DB) + Railway (API) + Vercel (Web)**

---

## 0. 사전 준비 — 계정 생성

| 서비스 | 용도 | 무료 플랜 |
|--------|------|-----------|
| [supabase.com](https://supabase.com) | PostgreSQL DB | ✅ |
| [railway.app](https://railway.app) | API 서버 | ✅ (월 $5 크레딧) |
| [vercel.com](https://vercel.com) | 프론트엔드 | ✅ |

---

## 1단계 — Supabase (DB 셋업)

1. Supabase → **New Project** 생성
2. **Settings → Database → Connection string (URI)** 복사

```
postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
```

3. **SQL Editor** 에서 아래 파일들을 순서대로 붙여넣고 실행

```
packages/db/migrations/20260313_phase1_init.sql
packages/db/migrations/20260313_phase1_rls.sql
packages/db/migrations/20260318_accuracy_policy_v1.sql
```

4. **plans 테이블 시드 데이터** 입력 (SQL Editor)

```sql
INSERT INTO plans (code, display_name, price_krw, included_minutes, trial_calls, max_session_minutes, active)
VALUES
  ('free',  '무료',   0,      0,  3, 10, true),
  ('basic', '베이직', 9900,  60,  0, 20, true),
  ('pro',   '프로',   19900, 180, 0, 40, true)
ON CONFLICT (code) DO NOTHING;
```

> `trial_calls = 3` → 신규 유저는 무료 통화 3회 후 자동 차단됨

---

## 2단계 — GitHub에 코드 푸시

```bash
git add .
git commit -m "deploy: add deployment configs and fix OpenAI model"
git push origin main
```

---

## 3단계 — Railway (API 서버 배포)

### 3-a. 프로젝트 생성

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. `LinguaCall` 레포 선택
3. **Settings → Dockerfile Path** 지정

```
apps/api/Dockerfile
```

### 3-b. 환경변수 설정

Railway 대시보드 → **Variables** 탭에서 아래 항목 입력:

```
DATABASE_URL                        = postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
OPENAI_API_KEY                      = sk-proj-...
OPENAI_REALTIME_MODEL               = gpt-realtime
OPENAI_REALTIME_VOICE               = alloy
OPENAI_REALTIME_TRANSCRIPTION_MODEL = gpt-4o-mini-transcribe
OPENAI_REALTIME_SESSION_URL         = https://api.openai.com/v1/realtime/sessions
ENABLE_WORKER_BATCH_LOOP            = true
WORKER_BATCH_INTERVAL_MS            = 30000
NODE_ENV                            = production
PORT                                = 3000
PUBLIC_BASE_URL                     = https://[your-web.vercel.app]  ← 4단계 후 채움
```

> `NODE_ENV=production` 설정 시 mock 결제 엔드포인트가 자동으로 비활성화됨

### 3-c. 배포 확인

```bash
curl https://[your-api].up.railway.app/healthz
# 200 응답 확인
```

---

## 4단계 — Vercel (프론트엔드 배포)

### 4-a. 프로젝트 생성

1. [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. `LinguaCall` 레포 선택
3. **Root Directory**: `apps/web`
4. Framework: **Vite** (자동 감지됨)

### 4-b. 환경변수 설정

```
VITE_API_BASE_URL = https://[your-api].up.railway.app
```

### 4-c. 배포

**Deploy** 클릭 → 완료 후 URL 확인 (예: `https://lingua-call.vercel.app`)

---

## 5단계 — 마무리 연결

Railway → **Variables** 탭으로 돌아가서 업데이트:

```
PUBLIC_BASE_URL = https://lingua-call.vercel.app
```

Railway가 자동 재배포 → 완료.

---

## 배포 후 테스터 시나리오 검증

```
1. https://lingua-call.vercel.app 접속
2. 이름 / 이메일 입력 → Continue
3. 전화번호 입력 → debugCode 확인 후 인증
4. Start Session → 마이크 권한 허용
5. AI와 영어 통화 → 종료 → 리포트 확인
6. 3회 소진 후 4번째 통화 시도 → 402 차단 확인
```

---

## 요금제 및 접근 제한 구조

| 상태 | 허용 | 차단 |
|------|------|------|
| 신규 유저 | 무료 통화 3회 | 4회째부터 402 에러 |
| 유료 플랜 | 플랜 분 소진까지 | 잔여 분 없으면 402 에러 |
| mock 결제 | 로컬 개발 환경만 | production 에서 404 |

---

## 비용 예상

| 서비스 | 무료 한도 | 초과 시 |
|--------|-----------|---------|
| Supabase | DB 500MB, 월 50만 row | $25/월~ |
| Railway | 월 $5 크레딧 (약 500시간) | 사용량 기반 |
| Vercel | 무제한 정적 배포 | 무료 |
| OpenAI | 없음 (pay-as-you-go) | gpt-4o-realtime 분당 ~$0.06 |

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| API 403 / CORS 에러 | `PUBLIC_BASE_URL` 미설정 | Railway Variables 확인 |
| 통화 시작 시 에러 | `OPENAI_API_KEY` 누락 | Railway Variables 확인 |
| 페이지 새로고침 시 404 | Vercel rewrite 미적용 | `apps/web/vercel.json` 확인 |
| 예약 세션 미동작 | `ENABLE_WORKER_BATCH_LOOP` 누락 | Railway 에 `true` 추가 |
| 통화 즉시 실패 | 잘못된 OpenAI 모델명 | `gpt-realtime` 확인 |
| Start Call 즉시 400 / `unable_to_initiate_call` | 최신 DB migration 누락 | `20260318_accuracy_policy_v1.sql` 실행 |
