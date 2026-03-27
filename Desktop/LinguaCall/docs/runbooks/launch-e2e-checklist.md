# 출시 전 E2E 체크리스트

이 문서는 현재 LinguaCall 런치 경로를 기준으로 한 메인 E2E 체크리스트다.

## 함께 볼 문서

- 배포: [`vps-deploy.md`](./vps-deploy.md)
- 전화번호 인증: [`supabase-phone-auth-manual.md`](./supabase-phone-auth-manual.md)
- 결제: [`toss-sandbox-manual.md`](./toss-sandbox-manual.md)

## 사전 조건

아래가 모두 준비되어 있어야 한다.

- VPS에서 `web`, `api`, `worker`, `caddy`가 실행 중
- `https://APP_DOMAIN`, `https://API_DOMAIN` 접근 가능
- Supabase Phone Auth 활성화 완료
- Toss 키 설정 완료
- OpenAI 키 설정 완료

## 1. 플랫폼 상태 확인

### API

```bash
curl -i "https://API_DOMAIN/healthz"
```

기대 결과:

- HTTP `200`
- JSON 응답에 `ok: true`

### Worker 수동 실행

```bash
curl -i -X POST "https://API_DOMAIN/workers/run" -H "x-worker-token: YOUR_WORKER_SHARED_SECRET"
```

기대 결과:

- HTTP `200`

### App

```bash
curl -I "https://APP_DOMAIN"
```

기대 결과:

- HTTP `200`

## 2. 전화번호 인증 E2E

상세 절차는 [`supabase-phone-auth-manual.md`](./supabase-phone-auth-manual.md)를 함께 본다.

확인 순서:

1. `https://APP_DOMAIN/#/` 접속
2. `/#/verify`로 이동
3. 전화번호 입력
4. OTP 요청
5. OTP 입력
6. `/#/session` 진입 확인
7. 브라우저 새로고침
8. 로그인 유지 확인
9. 로그아웃
10. `/#/session` 재진입 시 로그인 화면으로 돌아가는지 확인

기대 결과:

- OTP 요청 성공
- OTP 검증 성공
- 새로고침 후 세션 유지
- 로그아웃 후 보호 경로 차단

## 3. 결제 E2E

상세 절차는 [`toss-sandbox-manual.md`](./toss-sandbox-manual.md)를 함께 본다.

확인 순서:

1. 로그인 상태에서 `https://APP_DOMAIN/#/billing` 진입
2. 플랜 선택
3. Toss 결제 시작
4. 샌드박스 결제 완료
5. 앱으로 복귀
6. 구독 상태가 갱신되었는지 확인

예상 API 호출:

- `POST /billing/checkout`
- `POST /billing/toss/confirm`
- `GET /billing/subscription`

기대 결과:

- checkout 시작 성공
- confirm 성공
- 현재 플랜 상태가 별도 수작업 없이 갱신됨

## 4. 세션 생성 확인

확인 순서:

1. `/#/session` 진입
2. 새 세션 생성
3. 새로고침
4. 목록에 세션이 유지되는지 확인

기대 결과:

- 세션 생성 성공
- 목록과 상세 상태 일치

## 5. 실시간 통화 확인

확인 순서:

1. 라이브 세션 시작
2. 마이크 권한 허용
3. 연결 성공 확인
4. 짧게 발화
5. AI 응답 확인
6. 통화 종료

기대 결과:

- bootstrap 오류 없음
- 통화 시작 가능
- 통화 종료 가능

## 6. 리포트 생성 확인

확인 순서:

1. 세션 종료
2. worker 처리 대기
3. 리포트 화면 열기
4. 점수, 요약, 교정 내용 렌더링 확인

기대 결과:

- 수동 DB 조작 없이 리포트가 생성됨

## 7. 브라우저 화면 확인

아래 화면을 직접 확인한다.

- `/`
- `/#/verify`
- `/#/session`
- `/#/billing`
- `/#/report/:id`
- `/#/privacy`
- `/#/terms`

기대 결과:

- 데스크톱 레이아웃 문제 없음
- 모바일 레이아웃 문제 없음
- 깨진 문자열 없음
- 동작하지 않는 CTA 없음

## 8. 실패 시 확인할 로그

```bash
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=200 api
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=200 web
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=200 worker
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=200 caddy
```

## 9. Go / No-Go 기준

Go:

- health check 통과
- 전화번호 인증 동작
- 결제 동작
- 세션 생성 동작
- 실시간 통화 동작
- 리포트 렌더링 동작
- 보호 경로가 정상적으로 보호됨

No-Go:

- 로그인 완료 불가
- 결제 confirm 실패
- 라이브 세션 시작 또는 종료 실패
- 리포트가 생성되지 않음
