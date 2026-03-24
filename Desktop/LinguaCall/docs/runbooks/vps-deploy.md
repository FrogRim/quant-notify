# VPS 배포 런북

이 문서는 **Ubuntu VPS 한 대**에 LinguaCall을 올릴 때, 처음부터 검증까지 따라 할 수 있도록 적어 두었습니다. 전제는 저장소 루트에 `infra/docker-compose.yml`과 `infra/Caddyfile`이 있다는 것입니다.

---

## 1. 무엇이 어떻게 떠 있나 (한 장 요약)

| 구분 | 역할 |
|------|------|
| **caddy** | 80/443으로 들어온 요청을 도메인별로 나눔. TLS(HTTPS) 자동 발급·갱신. |
| **web** | 정적 프론트. `nginx-unprivileged`가 정적 파일을 서빙하며 컨테이너 안에서는 **8080** 포트만 노출. |
| **api** | 백엔드 API. 컨테이너 안 **3000** 포트. DB·OpenAI·토스·SMS 등과 통신. |
| **worker** | 주기적으로 배치 작업을 돌리며, 필요 시 **api**의 HTTP 엔드포인트를 호출. |

**밖에서 보이는 주소**

- 브라우저는 `https://APP_DOMAIN` → Caddy → `web:8080`
- 클라이언트/프론트의 API 호출은 `https://API_DOMAIN` → Caddy → `api:3000`

**관리형 DB**

- 애플리케이션 DB는 **Supabase Postgres** 하나를 쓰는 전제입니다. VPS 안에 Postgres를 띄우지 않습니다.

**외부 SaaS (키만 맞추면 됨)**

- OpenAI, Toss Payments, Naver Cloud SMS 등 — 값은 모두 `infra/.env.production`에 넣습니다.

---

## 2. VPS에 필요한 것 (체크리스트)

- [ ] **Ubuntu** (22.04 LTS 등) 서버 1대, **공인 IP** 확보
- [ ] **SSH**로 root 또는 sudo 가능한 유저로 접속 가능
- [ ] **방화벽**: 인바운드 **80**, **443** 허용 (SSH 22는 본인만)
- [ ] **Docker Engine** + **Docker Compose plugin** 설치
- [ ] DNS에 **A 레코드 2개** (또는 각각 CNAME으로 같은 IP)
  - `APP_DOMAIN` → VPS IP (예: `app.example.com`)
  - `API_DOMAIN` → VPS IP (예: `api.example.com`)
- [ ] **Supabase**에서 프로젝트 생성 후 **연결 문자열**(`DATABASE_URL`) 확보
- [ ] OpenAI / Toss / Naver SMS 등 **API 키** 준비

DNS가 아직 전파되지 않으면 Caddy가 Let’s Encrypt 인증서를 못 받을 수 있습니다. 배포 전에 `ping app.example.com` 등으로 IP가 맞는지 확인하는 것이 좋습니다.

---

## 3. Ubuntu에서 Docker 설치 (예시)

공식 문서와 동일한 흐름을 한 번에 쓰면 대략 다음과 같습니다. (이미 설치되어 있으면 이 절은 건너뜁니다.)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

`usermod` 후에는 **로그아웃했다가 다시 SSH 접속**해야 `docker` 그룹이 적용되는 경우가 많습니다.

확인:

```bash
docker version
docker compose version
```

---

## 4. 코드 가져오기와 작업 디렉터리

VPS에서 Git 저장소를 **한 디렉터리**에 클론합니다. 이후 모든 `docker compose` 명령은 **저장소 루트**( `infra` 폴더의 부모)에서 실행합니다.

```bash
cd ~
git clone <YOUR_REPO_URL> linguacall
cd linguacall
```

구조 예:

- `infra/docker-compose.yml` — 서비스 정의
- `infra/Caddyfile` — 도메인별 리버스 프록시
- `infra/.env.production.example` — 복사해서 채울 샘플
- `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/worker/Dockerfile` — 빌드에 사용

---

## 5. 환경 변수 파일 만들기

```bash
cp infra/.env.production.example infra/.env.production
nano infra/.env.production   # 또는 vim, VS Code Remote 등
```

### 5.1 도메인·URL (서로 일치시키기)

| 변수 | 의미 | 예시 |
|------|------|------|
| `APP_DOMAIN` | 프론트용 호스트 이름 (Caddy가 인증서 발급할 이름) | `app.example.com` |
| `API_DOMAIN` | API용 호스트 이름 | `api.example.com` |
| `APP_BASE_URL` | 브라우저에서 여는 앱의 공개 URL | `https://app.example.com` |
| `API_BASE_URL` | API 공개 URL (worker·스모크 테스트도 이 값 사용) | `https://api.example.com` |
| `ALLOWED_ORIGINS` | API CORS 허용 출처. 보통 앱 URL 하나 | `https://app.example.com` |
| `VITE_API_BASE_URL` | **빌드 시** 프론트에 박히는 API 주소 | `https://api.example.com` |

주의: `APP_BASE_URL`, `API_BASE_URL`, `VITE_API_BASE_URL`, `ALLOWED_ORIGINS`의 HTTPS URL은 **검증 스크립트가 https만 허용**합니다.

### 5.2 비밀 값 (직접 예시 넣지 말 것)

- `SESSION_COOKIE_SECRET` — 세션/쿠키용. 긴 랜덤 문자열.
- `WORKER_SHARED_SECRET` — `POST /workers/run` 등 worker 전용 호출을 보호. API와 worker에 **동일한 값**.

생성 예 (64 hex):

```bash
openssl rand -hex 32
```

`replace-me`, `replace-with-long-random-secret` 같은 플레이스홀더는 반드시 교체합니다.

### 5.3 DB·외부 API

- `DATABASE_URL` — Supabase에서 제공하는 `postgresql://...` 형식.
- OpenAI·Toss·Naver SMS — 예시 파일의 키 이름 그대로 채웁니다. `scripts/validate-launch-env.cjs`가 비어 있지 않은지 등을 검사합니다.

---

## 6. 배포 전 검증 (로컬 또는 VPS에서)

저장소 루트에서:

```bash
node scripts/validate-launch-env.cjs infra/.env.production
```

`[launch-env] ok`가 나와야 합니다. missing/invalid가 나오면 메시지에 맞춰 `.env.production`을 고칩니다.

---

## 7. 빌드 및 기동

**반드시 저장소 루트**에서:

```bash
git pull
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build
docker compose --env-file infra/.env.production -f infra/docker-compose.yml up -d
```

- `build`는 이미지를 만듭니다. 의존성·코드가 바뀌면 다시 필요합니다.
- `up -d`는 백그라운드로 컨테이너를 띄웁니다.

**Caddy와 도메인**

- `infra/Caddyfile`은 `{$APP_DOMAIN}`, `{$API_DOMAIN}`을 사용합니다.
- `docker-compose.yml`의 `caddy` 서비스는 이 두 값을 컨테이너 환경으로 넘깁니다. `--env-file infra/.env.production`으로 값이 주입되어야 합니다.

상태 확인:

```bash
docker compose --env-file infra/.env.production -f infra/docker-compose.yml ps
```

로그 (예: Caddy 인증서 오류 확인):

```bash
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs -f caddy
```

---

## 8. 배포 후 검증

### 8.1 컨테이너 상태

`caddy`, `web`, `api`, `worker`가 모두 `running`(또는 정상)이어야 합니다.

### 8.2 API 헬스체크

VPS에서 (`api.example.com`을 본인 `API_DOMAIN`으로 바꿈):

```bash
curl -sS "https://api.example.com/healthz"
```

JSON에 `ok: true` 류의 응답이 오면 API는 최소한 떠 있는 것입니다.

### 8.3 Worker HTTP 트리거 (수동)

`.env.production`의 `WORKER_SHARED_SECRET` 값을 알고 있다면:

```bash
curl -sS -X POST "https://api.example.com/workers/run" \
  -H "x-worker-token: 실제_WORKER_SHARED_SECRET_값"
```

(한 줄로 쓰려면 헤더 값만 따옴표로 감싸면 됩니다.)

### 8.4 스모크 스크립트 (권장)

로컬 PC나 VPS 어디서든, **공개 HTTPS API**에 붙어서 확인합니다.

```bash
export API_BASE_URL="https://api.example.com"
export WORKER_SHARED_SECRET="실제_시크릿"
node scripts/launch-smoke.cjs
```

`healthz`, `workers-run`에 대해 `ok`가 출력되어야 합니다.

---

## 9. 운영 메모

- **배치 루프**: 장기 실행 스케줄은 **worker** 컨테이너가 담당합니다. API만 재시작해도 worker는 별도 프로세스이므로 필요 시 각각 재시작합니다.
- **특정 서비스만 재시작**:

```bash
docker compose --env-file infra/.env.production -f infra/docker-compose.yml restart api
docker compose --env-file infra/.env.production -f infra/docker-compose.yml restart worker
```

- **코드·환경 변경 후 재반영**: 이미지가 바뀌는 경우 `build` 후 `up -d`를 다시 수행합니다. `.env.production`만 바꾼 경우 해당 컨테이너를 재시작하면 됩니다.

---

## 10. 롤백

마지막으로 알려진 좋은 커밋이나 태그로 되돌린 뒤, 같은 compose 명령으로 다시 올립니다.

```bash
git fetch --tags
git checkout <last-known-good-tag-or-commit>
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build
docker compose --env-file infra/.env.production -f infra/docker-compose.yml up -d
```

---

## 11. 자주 막히는 지점 (트러블슈팅)

| 증상 | 점검 |
|------|------|
| Caddy가 인증서를 못 받음 | DNS A 레코드가 VPS IP를 가리키는지, 80/443이 막히지 않았는지, 도메인 오타 없는지 |
| `web`은 뜨는데 API만 502 | `api` 로그, `DATABASE_URL`·필수 env 누락 여부 |
| CORS 오류 | `ALLOWED_ORIGINS`에 **정확히** 브라우저 주소줄의 origin(보통 `https://app...`)이 들어갔는지 |
| worker가 동작 안 함 | `API_BASE_URL`이 공개 URL인지, `WORKER_SHARED_SECRET`이 API와 동일한지, `worker` 로그 |
| 프론트가 엉뚱한 API로 요청 | `VITE_API_BASE_URL`은 **빌드 타임** 변수 → 변경 후 `web` 이미지를 **다시 build** |

---

## 12. 필수 환경 변수 한 번에 보기 (최소 예시)

```env
APP_DOMAIN=app.example.com
API_DOMAIN=api.example.com
APP_BASE_URL=https://app.example.com
API_BASE_URL=https://api.example.com
ALLOWED_ORIGINS=https://app.example.com
VITE_API_BASE_URL=https://api.example.com
VITE_TOSS_CLIENT_KEY=test_ck_...

DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EVAL_MODEL=gpt-4.1-mini

TOSS_CLIENT_KEY=...
TOSS_SECRET_KEY=...

NAVER_SMS_SERVICE_ID=...
NAVER_SMS_ACCESS_KEY=...
NAVER_SMS_SECRET_KEY=...
NAVER_SMS_FROM=...

SESSION_COOKIE_SECRET=replace-me
WORKER_SHARED_SECRET=replace-me
WORKER_BATCH_INTERVAL_MS=30000
WORKER_BATCH_LIMIT=20
```

실제 값은 `infra/.env.production.example`을 복사해 채우는 방식이 안전합니다.

---

## 13. 다음 단계 (출시 전 검증)

스택이 뜬 뒤에는 **이 문서만으로 끝나지 않습니다.** 아래를 **기준 문서**로 삼아 순서대로 진행하세요.

1. [launch-e2e-checklist.md](./launch-e2e-checklist.md) — 전체 E2E·Go/No-Go
2. 인증(OTP) 단계에서 [naver-sms-manual.md](./naver-sms-manual.md)를 함께 참고
3. 결제 단계에서 [toss-sandbox-manual.md](./toss-sandbox-manual.md)를 함께 참고
