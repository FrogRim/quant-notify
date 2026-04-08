# LinguaCall 작업 목록

## Phase 1: PTT (Push-to-Talk) ✅
- [x] `webVoiceClient.ts` — `pttMode` 옵션 추가, 자동 인사 제거
- [x] `webVoiceClient.ts` — 초기 마이크 음소거 처리 (`track.enabled = false`)
- [x] `webVoiceClient.ts` — 컨트롤러에 `startSpeaking()` / `stopSpeaking()` 추가
- [x] `ScreenSession.tsx` — PTT 버튼 UI (말하기 시작 / 말하기 종료)
- [x] `pnpm typecheck` 통과 확인

## Phase 2: 단계/상황 설정 세분화
- [ ] `ScreenSession.tsx` — `stage` 선택 UI 추가 (준비/모의/실전)
- [ ] `ScreenSession.tsx` — `situation` 선택 UI 추가 (언어별 프리셋)
- [ ] `ScreenSession.tsx` — stage + situation + topic 조합하여 API 전달
- [ ] `pnpm typecheck` 통과 확인

## Phase 3: 조기 종료 키워드 감지 ✅
- [x] `webVoiceClient.ts` — `earlyExitKeywords` 옵션 + 콜백 추가
- [x] `webVoiceClient.ts` — 트랜스크립트 완성 시 키워드 매칭 로직
- [x] `ScreenSession.tsx` — 종료 키워드 목록 전달 + `onEarlyExit` 처리
- [x] `pnpm typecheck` 통과 확인

## Phase 4: UI/UX — 세션 로그 하단 고정 + 편집 ✅
- [x] `ScreenSession.tsx` — 세션 목록 max-h-[40vh] overflow-y-auto 스크롤 영역
- [x] `ScreenSession.tsx` — 세션 목록에 삭제(휴지통) 버튼 추가
- [x] `sessions.ts` (API) — DELETE `/sessions/:id` 엔드포인트 추가
- [x] `inMemoryStore.ts` — `deleteSession()` 메서드 추가
- [x] `api.ts` — `delete()` 메서드 추가
- [x] `pnpm typecheck` 통과 확인

## Phase 5: 리포트 — 문장 하이라이팅 ✅
- [x] `highlightHelpers.ts` — `buildHighlightSegments()` 순수 함수 (4개 테스트)
- [x] `ScreenReport.tsx` — `/sessions/:id/messages` 트랜스크립트 로드
- [x] `HighlightedUserText` — issue=빨간 취소선, suggestion=파란 인라인
- [x] `HighlightedTranscript` — 채팅 버블 레이아웃
- [x] `pnpm typecheck` 통과 확인

## Phase 6: 리포트 — 단어 사전 팝오버 ✅
- [x] `dictionary.ts` — GET /dictionary?word=&lang= (gpt-4o-mini, Map 캐시)
- [x] `index.ts` — /dictionary 라우터 등록
- [x] `WordSpan` — 클릭 시 pos/meaning/example 팝오버
- [x] `ClickableText` — 텍스트를 단어 단위 클릭 가능한 span으로 분리
- [x] `pnpm typecheck` 통과 확인

## UI 정렬: DESIGN.md 기준 ✅
- [x] `AuthLayout.tsx` — 그라디언트 제거, amber 색상 → neutral 토큰
- [x] `AppShell.tsx` — 그라디언트 제거, blur 장식 제거, amber HeroSection 정리
- [x] `SectionCard.tsx` — border-radius 축소, border-border 적용
- [x] `ScreenLogin.tsx` — amber 배지 → neutral
- [x] `ScreenVerify.tsx` — emerald 배지 → neutral, input radius 정규화
