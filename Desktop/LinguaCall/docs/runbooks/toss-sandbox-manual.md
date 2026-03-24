# Toss Sandbox 검증 매뉴얼

이 문서는 **배포된 웹·API**에서 Toss **샌드박스** 결제 흐름을 검증할 때 쓰는 **보조 런북**입니다.

**메인 순서**는 [launch-e2e-checklist.md](./launch-e2e-checklist.md) **§3 Toss Sandbox 결제 E2E**입니다.

---

## 범위

- 빌링 페이지가 Toss SDK로 결제창을 띄우는지 (`VITE_TOSS_CLIENT_KEY`)
- 샌드박스 결제 후 앱으로 복귀하는지
- 복귀 후 `POST /billing/toss/confirm`이 호출되는지
- `GET /billing/subscription`·DB에 구독·플랜이 반영되는지

관련 프론트 코드 흐름:

- `POST /billing/checkout` — 서버가 `orderId`, `amount`, `successUrl`, `customerKey` 등 반환
- 토스 SDK `requestPayment` — `successUrl` / `failUrl`로 이동
- 복귀 URL에 `checkout=success`이면 `readTossRedirectParams`로 `paymentKey`, `orderId`, `amount`를 읽어 `POST /billing/toss/confirm`

**Hash 라우터:** 앱 URL은 `https://APP_DOMAIN/#/billing?...` 형태입니다. 토스가 리다이렉트한 뒤 **주소줄 전체**에 `paymentKey`, `orderId`, `amount`가 어디에 붙었는지(쿼리 vs 해시) 개발자도구에서 한 번 확인하면 디버깅에 도움이 됩니다. `readTossRedirectParams`는 `new URL(currentUrl).searchParams`를 사용하므로, 이 값들이 **URL의 query 문자열** 쪽에 있어야 파싱됩니다. confirm이 자동으로 안 되면 주소 형태를 먼저 의심합니다.

---

## 사전 준비

- `https://APP_DOMAIN`, `https://API_DOMAIN` 모두 TLS 정상.
- `infra/.env.production`:
  - **API**: `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` → **샌드박스(테스트) 키** (`test_ck_...`, `test_sk_...`)
  - **웹 빌드 시 주입**: `VITE_TOSS_CLIENT_KEY` → **클라이언트용 테스트 키** (보통 `TOSS_CLIENT_KEY`와 동일 계열)
- **웹 이미지 재빌드**: `VITE_*`를 바꾼 뒤에는 `docker compose ... build web` (또는 전체 build) 필요.
- [launch-e2e-checklist.md](./launch-e2e-checklist.md) **§2**까지 완료 — 빌링 API는 인증 필요.
- DB `plans` 테이블에 **활성 유료 플랜**이 1개 이상. 마이그레이션만 돌고 seed가 없으면 수동 INSERT 필요:

```sql
select code, display_name, price_krw, active from plans where active = true;
```

행이 없거나 유료(`price_krw > 0`)가 없으면 `checkout`이 실패할 수 있습니다. `code` 값(예: `basic`, `pro`)이 UI·API와 맞는지 확인합니다.

---

## 1. 사전 점검

### 1.1 API 헬스

```bash
curl -sS "https://${API_DOMAIN}/healthz"
```

### 1.2 브라우저 (로그인 상태)

1. `https://APP_DOMAIN/#/billing` 열기.
2. DevTools → **Network** → 필터 `billing`.
3. 아래가 **200**인지 확인:
   - `GET .../billing/plans`
   - `GET .../billing/subscription`

401이면 쿠키 세션이 없는 것 — OTP 인증부터 다시 합니다.

---

## 2. Checkout 시작

1. `/#/billing`에서 유료 플랜 카드의 **업그레이드/결제** 버튼 클릭.

### 기대 결과

- `POST /billing/checkout` — 200, 본문 `ok: true`, `data`에 대략:
  - `provider: "toss"`
  - `orderId`, `orderName`, `amount`
  - `successUrl`, `failUrl`
  - `customerKey`
- 이어서 Toss 결제창(위젯) 로드.

### 결제창이 안 뜰 때

- 브라우저 **콘솔** 에러 (SDK 로드 실패, 키 누락 등).
- `VITE_TOSS_CLIENT_KEY` 빈 문자열이면 프론트에서 `toss client key is not configured` 류 에러.
- 배포된 번들에 옛 키가 박혀 있지 않은지 — **web 이미지 재빌드** 여부.

### checkout API가 실패할 때

- Network에서 응답 JSON의 `error.message` 확인.
- API 로그, `plans` 테이블, 현재 사용자 상태(이미 구독 중인지 등).

---

## 3. Sandbox 결제 진행

1. Toss **개발자 문서**에 안내된 **샌드박스 테스트 카드·결제수단**으로 승인합니다.  
   공식 문서: [Toss Payments 문서](https://docs.tosspayments.com/)에서 “샌드박스”·“테스트” 키워드로 최신 수단을 확인하세요 (카드 번호는 문서가 바뀔 수 있음).
2. 결제 완료까지 진행.
3. 브라우저가 앱의 빌링 URL로 돌아오는지 확인.

### 기대 결과

- 주소에 `checkout=success` 등이 포함된 `#/billing?...` 상태.
- URL의 **query** 쪽에 토스가 넘겨준 `paymentKey`, `orderId`, `amount`가 잡히면, 프론트가 자동으로 `POST /billing/toss/confirm`을 호출합니다.
- UI에 잠시 `confirming payment...` 같은 표시가 나올 수 있음.

### cancel 흐름

- 사용자가 취소하면 `checkout=cancel` 쪽으로 돌아옵니다. 이때는 confirm 호출이 없어도 정상입니다.

---

## 4. 결과 확인

### 4.1 Network

- `POST /billing/toss/confirm` — **200**, 본문 `ok: true`.
- 이어지는 `GET /billing/subscription` — 플랜·상태 갱신.

### 4.2 UI

- 에러 배너가 남지 않음.
- “현재 구독” 또는 동등 영역에 유료 플랜 표시.

### 4.3 응답 저장 (증적)

- `POST /billing/toss/confirm`의 응답 JSON을 복사해 두면 출시 검토에 유리합니다 (민감 필드는 마스킹).

---

## 5. DB 확인 (Supabase SQL)

### 5.1 구독

```sql
select provider, plan_code, status, provider_subscription_id, updated_at
from subscriptions
order by updated_at desc
limit 10;
```

**기대:** `provider`가 toss 계열, `status`가 `active` 등 기대 상태.

### 5.2 사용자 플랜·잔여 분

```sql
select id, clerk_user_id, plan_code, paid_minutes_balance, updated_at
from users
order by updated_at desc
limit 10;
```

**기대:** 테스트 계정의 `plan_code`가 유료 플랜 코드로 갱신(구현에 따라 `paid_minutes_balance` 등도 변동).

### 5.3 크레딧 원장

앱이 `credit_ledger`를 쓰는 경우(스키마는 마이그레이션 기준):

```sql
select user_id, unit_type, entry_kind, delta, reason, created_at
from credit_ledger
order by created_at desc
limit 20;
```

allowance·구독 연동 로직이 있으면 관련 `reason`·`delta` 행이 생길 수 있습니다.

---

## 6. 실패 시 분기

### Checkout 요청 실패 (`POST /billing/checkout`)

- 응답 본문·API 로그.
- `plans`에 유효한 유료 플랜·`active = true`.
- 사용자가 이미 활성 구독을 가진 경우 비즈니스 규칙상 거절될 수 있음.

### 결제창은 떴는데 confirm 실패

- `TOSS_SECRET_KEY`가 **test_sk**와 짝이 맞는지 (라이브 키 혼입 여부).
- 복귀 URL에 `paymentKey`, `orderId`, `amount` 누락 여부 — **Hash만 바뀌고 search가 비어 있는 경우** 프론트 파싱 실패 가능.
- `POST /billing/toss/confirm` 응답 JSON·API 로그.

### Confirm은 200인데 subscription이 안 바뀜

- `subscriptions` / `users.plan_code` 직접 조회.
- 웹훅을 쓰는 배포라면 `webhook_events`·서명 시크릿(`BILLING_WEBHOOK_SECRET*` )도 점검 (이 저장소 빌링 라우트 구현 기준).

---

## 7. 운영 전환 시 알림

- 샌드박스에서 **여러 번** 성공한 뒤에만 `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` / `VITE_TOSS_CLIENT_KEY`를 **라이브 키**로 교체합니다.
- 키를 바꾼 뒤에는 반드시 **API 재시작 + web 재빌드**를 합니다.

---

## 8. 남겨야 할 증적

- 결제 전 `/#/billing` 화면
- Toss 샌드박스 결제 완료 화면
- 복귀 후 빌링 화면(구독 반영)
- `POST /billing/toss/confirm` 네트워크 응답
- (선택) `subscriptions` 최신 행 쿼리 결과

[launch-e2e-checklist.md](./launch-e2e-checklist.md) §8과 함께 보관합니다.
