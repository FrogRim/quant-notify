# Frontend Context Entry

Codex가 `apps/web` 범위에서 작업할 때 먼저 읽어야 할 문서 순서:

1. `../../DESIGN.md`
2. `../../docs/design/design-tokens.md`
3. `../../docs/design/page-ui-spec.md`
4. `../../docs/product/LinguaCall_PRD_v3.1_scope_locked.md`
5. `../../docs/engineering/LinguaCall_engineering_task_breakdown_v1.md`

## 실제 파일 구조

```
apps/web/src/
  App.tsx                        — 라우터, AuthGate, Footer
  main.tsx                       — Supabase Auth 초기화 진입점
  styles.css                     — Tailwind + CSS 변수 (design tokens)

  components/
    layout/
      AppShell.tsx               — 인증된 페이지 공통 레이아웃 (nav + main)
      AuthLayout.tsx             — 로그인/인증 2-column 레이아웃
      SectionCard.tsx            — SectionCard, MetricCard, StatusBanner, EmptyState
      PageLayout.tsx             — 단순 페이지 래퍼
      StaticDocumentPage.tsx     — 약관/개인정보 등 정적 문서용
    ui/
      button.tsx, card.tsx, badge.tsx, input.tsx, label.tsx
      select.tsx, separator.tsx
      LanguagePicker.tsx

  context/
    UserContext.tsx              — Supabase 세션, startPhoneOtp, verifyPhoneOtp

  features/
    auth/verifyFlow.ts           — OTP 인증 완료 후 세션 이동 흐름
    session/liveSession.ts       — 라이브 세션 컨트롤러 연결/해제 로직

  lib/
    api.ts                       — apiClient (Bearer auth), describeApiError
    webVoiceClient.ts            — OpenAI Realtime WebRTC 클라이언트 (PTT 지원)
    pttHelpers.ts                — PTT 순수 함수 (buildGreetingPayload 등)
    highlightHelpers.ts          — buildHighlightSegments (교정 하이라이팅)
    supabaseAuth.ts              — Supabase Auth 래퍼
    i18n.ts                      — i18next 초기화

  content/
    friendlyCopy.ts              — 다국어 UI 문자열

  pages/
    ScreenLogin.tsx              — 로그인 시작 화면
    ScreenVerify.tsx             — 전화번호 OTP 인증
    ScreenSession.tsx            — 세션 허브 + 라이브 세션 + 히스토리
    ScreenBilling.tsx            — 플랜 비교 + Toss 결제
    ScreenReport.tsx             — 리포트 상세 (하이라이팅, 사전 팝오버)
    ScreenPrivacy.tsx            — 개인정보처리방침
    ScreenTerms.tsx              — 이용약관
```

## 라우트

```
/#/             → ScreenLogin
/#/verify       → ScreenVerify
/#/session      → ScreenSession (AuthGate)
/#/billing      → ScreenBilling (AuthGate)
/#/report/:id   → ScreenReport (AuthGate)
/#/privacy      → ScreenPrivacy
/#/terms        → ScreenTerms
```

## 주의

- `DESIGN.md`가 전역 디자인 기준이다.
- design-tokens의 CSS 변수는 `styles.css`에 정의되어 있다.
- 인증은 Supabase Auth (phone OTP). Clerk 코드는 archival이다.
- `webVoiceClient.ts`는 PTT 모드(`pttMode: true`)로 실행된다.
