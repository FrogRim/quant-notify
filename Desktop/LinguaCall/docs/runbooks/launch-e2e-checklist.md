# 출시 전 E2E 체크리스트

이 문서는 **LinguaCall self-hosted 스택**(Caddy + web + api + worker + Supabase Postgres) 기준으로, 출시 직전에 한 번에 검증할 **메인 순서**입니다.

## 문서 관계 (읽는 순서)

```
[VPS 배포 완료]
       ↓
launch-e2e-checklist.md  ← 지금 문서 (기준)
       ↓
  ┌────┴────┐
  ↓         ↓
§2 인증   §3 결제
  ↓         ↓
solapi-   toss-
sms-      sandbox-
manual    manual
```

| 단계 | 이 문서에서 할 일 | 같이 펼칠 문서 |
|------|-------------------|----------------|
| 인프라 | (이미 완료했다고 가정) | [vps-deploy.md](./vps-deploy.md) |
| §0~1 | 사전 조건·헬스체크 | — |
| §2 | 전화번호 OTP·세션 | [solapi-sms-manual.md](./solapi-sms-manual.md) |
| §3 | Toss 샌드박스 결제 | [toss-sandbox-manual.md](./toss-sandbox-manual.md) |
| §4~6 | 세션·음성·리포트 | — |

**압축한 한 줄:** 배포 → 이 체크리스트 순서대로 진행 → OTP 구간은 Naver 매뉴얼, 결제 구간은 Toss 매뉴얼을 옆에 둔다.

---

## 프론트 URL (Hash Router)

웹 앱은 `HashRouter`를 씁니다. 브라우저 주소는 **`https://APP_DOMAIN/#/경로`** 형태입니다.

| 화면 | 주소 예시 (`APP_DOMAIN` = `app.example.com`) |
|------|-----------------------------------------------|
| 로그인(시작) | `https://app.example.com/#/` |
| 전화 인증 | `https://app.example.com/#/verify` |
| 세션 목록·라이브 | `https://app.example.com/#/session` |
| 빌링 | `https://app.example.com/#/billing` |

API 호출은 별도 호스트 `API_DOMAIN`(예: `https://api.example.com`)으로 나갑니다. `VITE_API_BASE_URL`과 일치해야 합니다.

---

## 검증에 쓰는 값 정리

터미널에서 반복 입력하기 쉽게, **본인 값**으로 치환해 두고 씁니다.

```bash
# 예시 — 실제 도메인·시크릿으로 바꿀 것
export APP_DOMAIN="app.example.com"
export API_DOMAIN="api.example.com"
export APP_BASE_URL="https://app.example.com"
export API_BASE_URL="https://api.example.com"
export WORKER_SHARED_SECRET="infra/.env.production 안의 값과 동일"
```

---

## 0. 사전 조건

시작 전에 아래가 모두 충족돼야 합니다.

### 0.1 런타임

- VPS에 `caddy`, `web`, `api`, `worker`가 **모두 기동**되어 있음 ([vps-deploy.md](./vps-deploy.md) 참고).
- DNS A 레코드로 `APP_DOMAIN`, `API_DOMAIN`이 **같은 VPS**를 가리킴.
- `APP_BASE_URL`, `API_BASE_URL`, `ALLOWED_ORIGINS`가 실제 공개 URL과 일치 (HTTPS).
- `infra/.env.production`에 다음이 채워져 있음:
  - `DATABASE_URL`, `OPENAI_*`
  - `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `VITE_TOSS_CLIENT_KEY` (샌드박스 검증 시 **테스트 키**)
  - `SOLAPI_*`
  - `SESSION_COOKIE_SECRET`, `WORKER_SHARED_SECRET`

### 0.2 DB 마이그레이션

Supabase **SQL Editor**(또는 `psql`)에서, 저장소의 `packages/db/migrations/` 아래 파일을 **이름 순서대로** 아직 적용 안 된 것만 실행합니다.

반드시 포함되어야 하는 예:

- `20260313_phase1_init.sql`, `20260313_phase1_rls.sql`
- `20260321_phone_otp.sql` — `phone_verifications`
- `20260323_auth_sessions.sql` — `auth_sessions`

적용 여부 확인 예시:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('phone_verifications', 'auth_sessions', 'plans', 'subscriptions');
```

`plans`에 **유료 플랜** 행이 최소 1개 있어야 빌링 E2E가 진행됩니다. 없으면 [toss-sandbox-manual.md](./toss-sandbox-manual.md)의 DB 점검·수동 삽입을 참고합니다.

### 0.3 쿠키·도메인 (OTP 이후 이슈 예방)

인증 쿠키(`lc_access`, `lc_refresh`)는 **API 응답**으로 `API_DOMAIN`에 설정됩니다. 프론트는 `APP_DOMAIN`에서 `API_DOMAIN`으로 `fetch(..., { credentials: 'include' })`를 보냅니다.

- `app.example.com` + `api.example.com`처럼 **같은 상위 도메인**이면 Chromium 계열에서 same-site로 취급되어 쿠키 전달이 단순해집니다.
- `ALLOWED_ORIGINS`에는 브라우저가 보내는 **Origin**과 정확히 일치하는 문자열이 들어가야 합니다 (보통 `https://app.example.com`, 끝 슬래시 없음).

---

## 1. 플랫폼 상태 확인

### 1.1 API·Worker HTTP

VPS 또는 로컬 터미널에서:

```bash
curl -sS "https://${API_DOMAIN}/healthz"
```

기대: HTTP 200, 본문에 `ok: true` (또는 동일 의미의 JSON).

```bash
curl -sS -X POST "https://${API_DOMAIN}/workers/run" \
  -H "x-worker-token: ${WORKER_SHARED_SECRET}"
```

기대: HTTP 2xx, 에러 메시지가 아닌 정상 배치 응답.

### 1.2 Worker 컨테이너 로그

```bash
cd /path/to/linguacall   # 저장소 루트
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs worker --tail 100
```

기대: 부팅 직후 DB 연결 실패·반복 크래시가 없음.

**여기서 실패하면 다음 단계로 진행하지 않습니다.**

---

## 2. 인증 E2E

상세 분기·SQL·증적은 [solapi-sms-manual.md](./solapi-sms-manual.md)와 병행합니다.

### 목표

- 배포 환경에서 전화번호 OTP와 **쿠키 기반 세션**이 끝까지 동작하는지 확인합니다.

### 진행 순서

1. 브라우저에서 `https://${APP_DOMAIN}/#/` 접속.
2. **전화번호로 계속하기**(또는 동등 버튼)로 `/#/verify` 이동.
3. 실제 한국 휴대폰 번호 입력(서버가 허용하는 형식 — 보통 `010...` 또는 E.164).
4. OTP 요청 → 문자 수신.
5. OTP 입력 후 검증 완료 → 자동으로 `/#/session` 등 인증된 화면으로 이동하는지 확인.
6. **강력 새로고침**(Ctrl+Shift+R) 후에도 로그인 유지되는지 확인.
7. 로그아웃(앱에 노출된 경우) 또는 `POST /auth/logout`에 해당하는 UI 동작.
8. `/#/session` 등 보호 화면 재접속 시 다시 로그인 흐름으로 가는지 확인.

### 브라우저에서 확인할 API (개발자 도구 → Network)

| 순서 | 메서드·경로 | 기대 |
|------|-------------|------|
| OTP 요청 | `POST https://API_DOMAIN/auth/otp/start` | 200, `ok: true` |
| OTP 검증 | `POST https://API_DOMAIN/auth/otp/verify` | 200, Set-Cookie에 `lc_access` 등 |
| 세션 확인 | `GET https://API_DOMAIN/auth/me` | 200, `ok: true` (이후 호출에서 쿠키 포함) |

### 통과 기준

- OTP 문자가 합리적 지연 내 도착.
- 새로고침 후에도 `auth/me` 기준 인증 유지.
- 로그아웃 후 보호 라우트에서 인증 요구.

### 실패 시 (요약)

- 문자 없음 → SOLAPI 콘솔·`SOLAPI_*`·발신번호 → [solapi-sms-manual.md](./solapi-sms-manual.md).
- verify 실패 → `phone_verifications`·API 로그.
- 새로고침 시 로그아웃 → `ALLOWED_ORIGINS`, HTTPS, API/앱 도메인 조합.

---

## 3. Toss Sandbox 결제 E2E

상세·DB 쿼리·증적은 [toss-sandbox-manual.md](./toss-sandbox-manual.md)와 병행합니다.

### 목표

- checkout → 토스 결제창 → redirect → `POST /billing/toss/confirm` → 구독 조회까지 연결을 검증합니다.

### 진행 순서

1. §2까지 완료된 계정으로 `https://${APP_DOMAIN}/#/billing` 접속.
2. 유료 플랜 선택 후 결제 진행 버튼 클릭.
3. Toss **샌드박스** 테스트 결제수단으로 승인.
4. 브라우저가 `#/billing?checkout=success&plan=...` 형태로 돌아오는지 확인.
5. 자동으로 `POST /billing/toss/confirm`이 호출되고, 에러 배너가 없어지는지 확인.
6. 페이지 새로고침 후 활성 구독·플랜 표시 확인.

### Network에서 볼 경로

- `POST /billing/checkout`
- (토스 위젯·리다이렉트)
- `POST /billing/toss/confirm`
- `GET /billing/subscription`

### 통과 기준

- 결제창 오픈, 복귀 후 confirm 성공.
- `GET /billing/subscription`에 샌드박스 기대 상태 반영.
- DB `subscriptions` 등에 행 생성·갱신(필요 시 SQL로 교차 검증).

### 실패 시 (요약)

- 위젯 미오픈 → `VITE_TOSS_CLIENT_KEY`·웹 **재빌드** 여부.
- confirm 실패 → `TOSS_SECRET_KEY`, redirect URL의 `paymentKey`/`orderId`/`amount` → [toss-sandbox-manual.md](./toss-sandbox-manual.md).

---

## 4. 세션 생성 E2E

### 목표

- 인증·(필요 시) 결제 후 실제 사용자 흐름으로 세션을 만들고 목록에 남는지 확인합니다.

### 진행 순서

1. `/#/session`에서 새 세션 생성.
2. 새로고침 후 목록에 동일 세션이 남는지 확인.
3. 가능하면 세션 상세·리포트 링크까지 열어봄.

### Network

- `POST /sessions` (또는 앱이 쓰는 생성 엔드포인트)
- `GET /sessions` 또는 목록 API

### 통과 기준

- 생성 성공, 권한 오류 없음, 새로고침 후에도 목록 유지.

### 실패 시

- `GET/POST /sessions`, `GET /users/me`, `auth/me` 응답과 API 로그.

---

## 5. Realtime 음성 스모크 테스트

### 목표

- 프로덕션에서 OpenAI Realtime·브라우저 마이크 파이프라인이 최소 한 번은 끝까지 도는지 확인합니다.

### 진행 순서

1. 라이브 세션 시작.
2. 마이크 권한 허용(HTTPS 필수).
3. 짧은 발화 한 번.
4. AI 음성 응답 청취.
5. 세션 정상 종료.

### 통과 기준

- `/calls/initiate` 또는 동등 초기화 성공.
- Realtime 연결·종료 시 provider 에러가 아닌 정상 완료.

### 실패 시

- 마이크·HTTPS, `OPENAI_API_KEY`·모델 env, API 로그의 realtime/bootstrap 구간.

---

## 6. 비동기 리포트 스모크 테스트

### 목표

- 세션 종료 후 worker가 리포트를 처리하는지 확인합니다.

### 진행 순서

1. 라이브 세션 종료.
2. UI 또는 DB에서 `report_status`가 `pending`인지 확인(앱에 노출되는 경우).
3. 필요 시 worker 수동 실행:

```bash
curl -sS -X POST "https://${API_DOMAIN}/workers/run" \
  -H "x-worker-token: ${WORKER_SHARED_SECRET}"
```

4. 리포트 화면 또는 API를 새로고침해 완료·내용 표시 확인.

### 통과 기준

- `pending`에서 벗어남, worker 로그에 evaluation 크래시 없음.

---

## 7. 최종 Go / No-Go 판정

### Go 조건

- 인증 E2E 통과
- Toss sandbox 결제 통과
- 세션 생성 통과
- Realtime 스모크 통과
- 리포트 스모크 통과
- worker 실행 성공
- 배포 로그에 치명적 에러 없음

### No-Go 조건

- OTP 전달 불안정
- Toss confirm 불안정 또는 구독 상태 불일치
- 라이브 세션 완료 실패
- worker 리포트 실패
- 새로고침 후 쿠키 인증 불안정

---

## 8. 꼭 남겨야 할 증적

- OTP 로그인 성공 화면 캡처
- Toss 샌드박스 결제 완료·빌링 화면 캡처
- 완료된 리포트 화면 캡처
- 아래 응답 텍스트 보관:
  - `GET /healthz` 응답
  - `POST /workers/run` 응답
  - `node scripts/validate-launch-env.cjs infra/.env.production` 성공 로그

---

## 9. 체크리스트 통과 후 즉시 할 일

1. 의존성 잠금 파일(`pnpm-lock.yaml` 등)이 배포와 맞는지 확인·갱신.
2. Docker 기반 VPS에서 smoke 재실행 ([vps-deploy.md](./vps-deploy.md) 검증 절).
3. 샌드박스 검증이 안정된 뒤에만 Toss **라이브** 키로 전환.
4. (조직 정책에 따라) `users.clerk_user_id` 등 레거시 명명·데이터 정리 일정 확정.
