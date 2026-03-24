# SOLAPI SMS OTP 검증 매뉴얼

이 문서는 **전화번호 OTP 로그인**을 SOLAPI(CoolSMS)로 검증할 때 쓰는 **보조 런북**입니다.

**메인 순서**는 [launch-e2e-checklist.md](./launch-e2e-checklist.md) **§2 인증 E2E**입니다. 이 문서는 그 단계를 더 잘게 쪼갠 참고서입니다.

---

## 범위

검증 대상:

- `POST /auth/otp/start` — OTP 발급·SMS 발송
- SOLAPI 실제 발송
- `POST /auth/otp/verify` — 코드 검증 후 **HTTP-only 쿠키** 설정
- 이후 `GET /auth/me` 및 `credentials: 'include'` API 호출로 **세션 유지**

코드 기준 쿠키 이름:

- `lc_access` — 액세스 토큰 (짧은 TTL)
- `lc_refresh` — 리프레시 토큰 (긴 TTL)

---

## 사전 준비

- [vps-deploy.md](./vps-deploy.md)까지 완료: `web`·`api`가 각각 **HTTPS**로 열림.
- `infra/.env.production`의 다음 키가 **프로덕션/테스트 발송**에 맞게 채워짐:
  - `SOLAPI_API_KEY`
  - `SOLAPI_API_SECRET`
  - `SOLAPI_FROM` — **SOLAPI에 등록된 발신번호**와 동일해야 함
- 문자를 받을 수 있는 **실제 휴대폰** 번호
- `ALLOWED_ORIGINS`에 웹 앱 Origin(예: `https://app.example.com`)이 정확히 포함됨

### API·웹 도메인이 다를 때

프론트는 `APP_DOMAIN`, API는 `API_DOMAIN`입니다. OTP 검증 응답의 `Set-Cookie`는 **API 호스트** 기준으로 내려갑니다. 브라우저는 `APP_DOMAIN` 페이지에서 `API_DOMAIN`으로 `fetch`할 때 쿠키를 붙입니다.

- 가능하면 `app.example.com` / `api.example.com`처럼 **같은 등록 도메인**을 쓰면 브라우저 same-site 정책에 유리합니다.
- 여전히 실패하면 크롬 개발자도구 → **Application → Cookies → `https://api...`** 에 `lc_access`가 생겼는지 확인합니다.

---

## 1. SOLAPI 콘솔 확인 (테스트 전)

1. [SOLAPI](https://solapi.com/) 로그인.
2. 발신번호/잔액/메시지 발송 로그를 확인할 수 있는 콘솔로 이동.
3. 아래를 확인합니다.
   - **API Key / API Secret**이 생성되어 있고, 앱에 넣은 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`과 동일한지.
   - **발신번호**가 등록·승인되어 있고, `SOLAPI_FROM`과 **숫자만 형식까지** 일치하는지.
   - **발송 한도·잔액**이 남아 있는지.

---

## 2. 웹 UI로 OTP 시작 흐름

1. 브라우저에서 `https://<APP_DOMAIN>/#/` 접속.
2. 전화 인증으로 진입해 `/#/verify`에서 번호 입력.
3. **인증 코드 보내기** 등 OTP 요청 버튼 클릭.

### 기대 결과

- UI에 마스킹된 번호 등 성공 표시.
- 휴대폰으로 OTP 문자 수신.

### Network 탭에서 확인

- 요청 URL: `https://<API_DOMAIN>/auth/otp/start`
- 메서드: `POST`
- 본문: JSON에 `phone` 필드
- 응답: HTTP 200, 바디에 `ok: true`, `data.maskedPhone` 등

### 문자가 오지 않을 때

1. **API 컨테이너 로그** (VPS 저장소 루트에서):

   ```bash
   docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs api --tail 200
   ```

   프로덕션에서 SOLAPI 미설정 시 코드는 콘솔 대신 에러를 낼 수 있습니다. `auth.otp` 관련 메시지·스택을 확인합니다.

2. **환경 변수** 오타·공백, 특히 `SOLAPI_API_KEY` / `SOLAPI_FROM`.
3. SOLAPI 콘솔에서 **발송 실패 로그**가 있는지.
4. 번호 형식: 앱이 `01012345678`만 받는지, `+8210...`만 받는지 `StartOtpSchema`·UI placeholder를 코드와 맞춰 본다.

---

## 3. OTP 검증 흐름

1. 수신한 코드를 입력하고 검증 제출.

### 기대 결과

- HTTP 200, `ok: true`, `data.userId`, `data.sessionId` 등.
- 응답 헤더 **Set-Cookie**에 `lc_access`, `lc_refresh`.
- 화면이 인증된 상태(예: `/#/session`)로 전환.

### Network

- `POST https://<API_DOMAIN>/auth/otp/verify`
- 직후 `GET https://<API_DOMAIN>/auth/me` 가 200으로 이어지는지(앱 마운트 시).

### verify가 401·422일 때

- 코드 오입력·만료.
- Supabase `phone_verifications`에서 `expires_at`, 시도 횟수 확인(§6 SQL).

---

## 4. 세션 유지 확인

1. **강력 새로고침** (캐시 무시).
2. `/#/session`, `/#/billing` 등 **AuthGate**가 있는 화면 진입.
3. (선택) 같은 브라우저에서 탭을 닫았다가 같은 URL로 다시 열기.

### 기대 결과

- `GET /auth/me`가 200.
- 보호 화면이 로그인/verify로 튕기지 않음.

### 새로고침만 하면 로그아웃되는 경우

- DevTools → Application → Cookies에서 **`API_DOMAIN`** 아래 쿠키 존재 여부.
- `ALLOWED_ORIGINS`에 **정확히** `https://app...` (프로토콜·호스트·포트 일치)가 있는지.
- API가 HTTPS이고 `NODE_ENV=production`이면 쿠키는 `Secure` — **HTTP로 API를 부르면 안 됨**.
- `VITE_API_BASE_URL`이 배포 API와 다른지(잘못된 호스트로 가면 쿠키가 안 붙음).

---

## 5. 로그아웃 확인

앱에서 로그아웃 UI가 있으면 사용합니다. 내부적으로는 보통 `POST /auth/logout` + 쿠키 삭제입니다.

### 기대 결과

- `lc_access` / `lc_refresh` 제거 또는 무효화.
- `/#/session` 접속 시 `/#/` 또는 `/#/verify`로 돌아감.

---

## 6. DB 확인 (Supabase SQL)

### 6.1 OTP 챌린지 `phone_verifications`

```sql
select phone, attempts, expires_at, created_at
from phone_verifications
order by created_at desc
limit 10;
```

**기대:**

- `otp/start` 직후 행이 생김.
- verify 성공 후 해당 행이 삭제되거나 정책에 따라 갱신됨(구현에 따름).

### 6.2 세션 `auth_sessions`

```sql
select user_id, expires_at, ip, user_agent, revoked_at, created_at
from auth_sessions
order by created_at desc
limit 20;
```

**기대:**

- verify 성공 직후 새 `auth_sessions` 행.

---

## 7. (선택) curl로 API만 따로 검증

브라우저 없이 API만 볼 때는 **쿠키 저장**이 번거로우므로, 보통은 UI 검증을 권장합니다. 참고용:

```bash
API="https://api.example.com"
curl -sS -X POST "$API/auth/otp/start" \
  -H "Content-Type: application/json" \
  -d '{"phone":"01012345678"}'
```

verify는 응답의 `Set-Cookie`를 `-c`로 저장해 다음 요청에 `-b`로 넘겨야 합니다.

---

## 8. 실패 시 분기 요약

| 증상 | 우선 확인 |
|------|-----------|
| start 5xx / OTP 미수신 | SOLAPI 키·발신번호·쿼타, `api` 로그 |
| verify 401 | 코드·만료·시도 횟수, `phone_verifications` |
| me 401이지만 verify는 성공 | 쿠키 도메인, `credentials: 'include'`, CORS, 잘못된 `VITE_API_BASE_URL` |
| CORS 에러 | `ALLOWED_ORIGINS` 정확한 문자열 |

---

## 9. 남겨야 할 증적

- `/#/verify`에서 OTP 요청 직전/직후 화면
- 수신 SMS(코드는 가리고)
- 인증 완료 후 `/#/session`(또는 메인) 화면
- (가능하면) `auth_sessions` 최신 1행 쿼리 결과 캡처

이 증적은 [launch-e2e-checklist.md](./launch-e2e-checklist.md) §8과 합쳐서 보관하면 됩니다.
