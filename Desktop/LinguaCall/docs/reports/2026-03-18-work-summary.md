# LinguaCall 작업 요약

Last updated: 2026-03-18

## 요약

현재 LinguaCall은 `React + WebVoice(OpenAI Realtime) + PostgreSQL` 기준으로 MVP 핵심 흐름이 정리된 상태다.

핵심 방향 전환:

- 기존 `PSTN/Twilio 전화 중심` 접근에서
- `브라우저 기반 Web Voice` 중심으로 전환

현재 기준으로 구현된 주요 흐름:

- 로그인 / 프로필 bootstrap
- 전화번호 verification
- immediate / scheduled session 생성
- Web Voice start / join / end
- transcript 저장
- report 생성
- billing screen / mock checkout 흐름
- OpenAI Realtime 기반 accuracy policy / validator 1차

---

## 이번까지 반영된 핵심 작업

## 1. Web Voice 전환

다음 방향으로 구조를 정리했다.

- 브라우저에서 마이크 권한 요청
- OpenAI Realtime 세션 bootstrap
- live session 진행
- 종료 후 transcript / report 생성

관련 파일:

- [apps/api/src/routes/calls.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/routes/calls.ts)
- [apps/api/src/services/webVoiceSessionService.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/webVoiceSessionService.ts)
- [apps/api/src/services/openaiRealtime.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/openaiRealtime.ts)
- [apps/web/src/lib/webVoiceClient.ts](C:/Users/user/Desktop/LinguaCall/apps/web/src/lib/webVoiceClient.ts)

---

## 2. React 프론트 기준 안정화

실제 프론트 구조가 React Router 기준임을 확인하고, 화면 흐름과 문서를 그 기준으로 다시 맞췄다.

정리된 화면:

- `/`
- `/verify`
- `/session`
- `/billing`
- `/report/:reportId`

수정 내용:

- 깨진 UI 문자열 수정
- Session polling 보강
- billing 성공/취소 플래시 일회성 처리
- billing 가격 문자열 수정

관련 파일:

- [apps/web/src/App.tsx](C:/Users/user/Desktop/LinguaCall/apps/web/src/App.tsx)
- [apps/web/src/pages/ScreenSession.tsx](C:/Users/user/Desktop/LinguaCall/apps/web/src/pages/ScreenSession.tsx)
- [apps/web/src/pages/ScreenBilling.tsx](C:/Users/user/Desktop/LinguaCall/apps/web/src/pages/ScreenBilling.tsx)
- [apps/web/src/pages/ScreenReport.tsx](C:/Users/user/Desktop/LinguaCall/apps/web/src/pages/ScreenReport.tsx)
- [apps/web/src/pages/ScreenVerify.tsx](C:/Users/user/Desktop/LinguaCall/apps/web/src/pages/ScreenVerify.tsx)

---

## 3. 로컬/운영 환경 정리

개발 중 가장 먼저 막히던 `.env` 문제를 해결했다.

반영 내용:

- API 부팅 전 `.env` 자동 로드
- OpenAI 기본 fallback 모델을 `gpt-realtime`으로 고정
- Twilio 주 경로를 기본 MVP 경로에서 제외
- 배포/운영 문서를 Web Voice 기준으로 재작성

관련 파일:

- [apps/api/src/loadEnv.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/loadEnv.ts)
- [apps/api/src/services/openaiRealtime.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/openaiRealtime.ts)
- [DEPLOY.md](C:/Users/user/Desktop/LinguaCall/DEPLOY.md)
- [docs/runbooks/web-voice-live-setup.md](C:/Users/user/Desktop/LinguaCall/docs/runbooks/web-voice-live-setup.md)
- [docs/runbooks/operator-live-setup-checklist.md](C:/Users/user/Desktop/LinguaCall/docs/runbooks/operator-live-setup-checklist.md)

---

## 4. 정확도 강화 아키텍처 v1

정확도는 단순 사실 정확도가 아니라 아래를 포함하는 것으로 재정의했다.

- 주제 유지 정확도
- 의도 정합성
- 교정 정합성
- 세션 상태 정합성

이를 위해 1차 accuracy 계층을 추가했다.

포함된 것:

- `SessionAccuracyPolicy`
- `SessionAccuracyState`
- `AccuracyValidationResult`
- transcript 기반 서버 validator
- accuracy flags를 report recommendation에 반영

관련 파일:

- [packages/shared/src/contracts.ts](C:/Users/user/Desktop/LinguaCall/packages/shared/src/contracts.ts)
- [apps/api/src/services/sessionAccuracy.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/sessionAccuracy.ts)
- [apps/api/src/storage/inMemoryStore.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/storage/inMemoryStore.ts)
- [apps/api/src/services/reportEvaluator.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/reportEvaluator.ts)
- [packages/db/migrations/20260318_accuracy_policy_v1.sql](C:/Users/user/Desktop/LinguaCall/packages/db/migrations/20260318_accuracy_policy_v1.sql)

---

## 5. 다국어 확장

초기에는 영어/OPIC 기준으로 정확도 계층을 넣었고, 이후 범위를 확장했다.

현재 상태:

- `en / opic`: strict accuracy policy
- `de / goethe_b2`: strict accuracy policy
- `es / dele_b1`: strict accuracy policy
- `zh / hsk5`: topic lock + pacing prompt 중심, validator는 더 느슨함

추가 내용:

- Unicode-aware tokenizer
- multilingual correction hint
- broader forbidden-domain hint

관련 파일:

- [apps/api/src/services/sessionAccuracy.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/sessionAccuracy.ts)
- [apps/api/src/services/openaiRealtime.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/openaiRealtime.ts)

---

## 6. 속도 / 묵음 이슈 대응

사용자 체감 이슈:

- 음성이 너무 빠름
- 중간에 묵음처럼 끊겨 들림

1차 대응:

- 프롬프트에 slower pacing 지시 추가
- 짧은 문장 사용 강제
- 문장 사이 짧은 pause 유도
- `speed: 0.9` 설정
- `turn_detection.silence_duration_ms = 900` 설정

주의:

- 이 부분은 라이브 체감 검증이 필요하다
- 실제 운영에선 VAD / speed 값을 다시 조정할 가능성이 높다

관련 파일:

- [apps/api/src/services/openaiRealtime.ts](C:/Users/user/Desktop/LinguaCall/apps/api/src/services/openaiRealtime.ts)

---

## 아직 남은 리스크

아직 실행하지 않은 것:

- DB migration 적용
- live smoke
- typecheck
- 전체 시나리오 테스트

현재 주요 리스크:

1. accuracy migration 미적용
- `sessions.accuracy_policy`
- `sessions.accuracy_state`

2. Realtime 속도/VAD 체감 미검증
- `speed: 0.9`
- `silence_duration_ms = 900`

3. 중국어 validator 품질은 아직 strict하지 않음

4. Stripe / Telegram 실연동은 아직 보류 상태

---

## 다음 권장 순서

1. accuracy migration 적용
2. immediate session live smoke
3. transcript 저장 확인
4. report 생성 확인
5. 언어별 smoke
   - 영어
   - 독일어
   - 스페인어
   - 중국어
6. 속도/묵음 체감 튜닝
7. 그 다음 Stripe / Telegram 실연동

---

## 참고 문서

- [handoff.md](C:/Users/user/Desktop/LinguaCall/handoff.md)
- [docs/roadmap/2026-03-18-future-work.md](C:/Users/user/Desktop/LinguaCall/docs/roadmap/2026-03-18-future-work.md)
- [docs/reports/2026-03-18-web-react-migration.md](C:/Users/user/Desktop/LinguaCall/docs/reports/2026-03-18-web-react-migration.md)
- [docs/runbooks/manual-screen-test-scenarios.md](C:/Users/user/Desktop/LinguaCall/docs/runbooks/manual-screen-test-scenarios.md)
- [docs/runbooks/web-voice-live-setup.md](C:/Users/user/Desktop/LinguaCall/docs/runbooks/web-voice-live-setup.md)
