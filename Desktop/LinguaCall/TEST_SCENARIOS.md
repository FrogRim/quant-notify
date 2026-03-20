# LinguaCall 테스트 시나리오

자동화 테스트: `pnpm --filter lingua-call-api test`
대상 환경: 로컬(`http://localhost:4000`) 또는 배포 URL

---

## T-001 공통 온보딩 플로우 (모든 언어 공통)

| 단계 | 행동 | 기대 결과 |
|------|------|-----------|
| 1 | 앱 접속 → 이름/이메일 입력 → Continue | Screen 2(전화번호) 이동 |
| 2 | 전화번호 입력 → Send Code | `debugCode` 화면에 표시됨 |
| 3 | debugCode 입력 → Verify | Screen 3(세션) 이동 |
| 4 | 우측 상단 Billing 클릭 | 플랜 목록 표시 (Free/Basic/Pro) |
| 5 | 다시 뒤로 | 세션 화면 복귀 |

---

## T-002 EN / OPIC — 영어 세션 (기준 시나리오)

**설정값:** Language = English, Level = IM3, Topic = daily conversation, Duration = 10min

| 단계 | 행동 | 기대 결과 |
|------|------|-----------|
| 1 | Language 드롭다운 → `🇺🇸 English — OPIC` 선택 | Level 옵션: NL/NM/NH/IL/IM1~3/IH/AL, Topic: 영어 주제 목록 |
| 2 | Level = IM3, Topic = daily conversation | 기본값 유지 |
| 3 | Create Session | "session created. Start the call when ready." |
| 4 | Start Call 클릭 → 마이크 허용 | Live Session 패널 표시, state = connecting |
| 5 | AI와 영어로 대화 (2분 이상) | 실시간 자막 표시, state = live |
| 6 | End Call | state = ended, 리포트 생성 대기 |
| 7 | View Report | Grammar/Vocab/Fluency 점수 + 피드백 텍스트 |

**확인 포인트:**
- AI가 영어로만 말하는지
- AI가 OPIC 스타일 질문을 하는지 (일상 묘사 유도)

---

## T-003 DE / Goethe B2 — 독일어 세션 ⭐ 핵심

**설정값:** Language = Deutsch, Level = B1, Topic = Studium und Beruf, Duration = 10min

| 단계 | 행동 | 기대 결과 |
|------|------|-----------|
| 1 | Language → `🇩🇪 Deutsch — Goethe B2` 선택 | Level 옵션: A2/B1/B2, Topic: 독일어 주제 목록으로 전환 |
| 2 | Level = B1, Topic = Studium und Beruf | 자동 기본값 설정됨 |
| 3 | Create Session | 세션 생성 성공, 목록에 `DE · GOETHE B2 · Studium und Beruf` 표시 |
| 4 | Start Call → 마이크 허용 | 연결 시작 |
| 5 | AI가 독일어로 먼저 인사 | `"Hallo! Ich bin LinguaCall..."` 형식 |
| 6 | 독일어로 자기소개 → AI 반응 | AI가 독일어로만 응답 |
| 7 | 문법 오류를 의도적으로 포함해 말하기 | AI가 즉시 교정 + 올바른 예시 제공 |
| 8 | 3~4분 단독 발화 후 AI 질문에 대답 | Monologisches→Dialogisches 흐름 전환 |
| 9 | End Call | 세션 종료 |
| 10 | View Report | 리포트에 Aussprache/Grammatik/Wortschatz/Flüssigkeit 피드백 |

**세부 검증 항목 (Goethe B2 특화):**
- [ ] AI가 전체 대화를 독일어로만 진행하는가
- [ ] Goethe B2 Sprechen 구조(단독/대화/반응)를 유도하는가
- [ ] 오류 교정이 즉각적이고 부드러운가 (`"Sehr gut! Man sagt besser..."`)
- [ ] 세션 말미에 4가지 평가 항목을 언급하는가

**주제별 시나리오 (괴테 테스터 추천 순서):**

| 회차 | Topic | Level | 연습 목적 |
|------|-------|-------|-----------|
| 1회 | Studium und Beruf | B1 | 워밍업, 기본 어휘 확인 |
| 2회 | Gesellschaft und Kultur | B1 | 의견 표현 연습 |
| 3회 | Umwelt und Natur | B2 | 복잡한 논증 구조 연습 |
| 4회 | Gesundheit | B2 | 어휘 다양성 테스트 |

---

## T-004 ZH / HSK5 — 중국어 세션

**설정값:** Language = 中文, Level = HSK4, Topic = 工作与职业

| 단계 | 행동 | 기대 결과 |
|------|------|-----------|
| 1 | Language → `🇨🇳 中文 — HSK 5` | Level: HSK3/4/5, Topic: 중국어 주제 |
| 2 | Create Session → Start Call | 연결 성공 |
| 3 | AI가 중국어로 인사 | `"你好！我是LinguaCall..."` |
| 4 | 중국어로 대화 | 보통화(普通话)로만 진행 |

---

## T-005 ES / DELE B1 — 스페인어 세션

**설정값:** Language = Español, Level = A2, Topic = vida cotidiana

| 단계 | 행동 | 기대 결과 |
|------|------|-----------|
| 1 | Language → `🇪🇸 Español — DELE B1` | Level: A1/A2/B1, Topic: 스페인어 주제 |
| 2 | Create Session → Start Call | 연결 성공 |
| 3 | AI가 스페인어로 인사 | `"¡Hola! Soy LinguaCall..."` |
| 4 | 스페인어로 대화 | 스페인어로만 진행 |

---

## T-006 언어/시험 차단 검증 (API 직접 호출)

잘못된 조합 요청 시 422 응답을 반환해야 합니다.

```bash
# DE + opic 조합 시도 (차단 대상)
curl -X POST http://localhost:4000/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-jwt>" \
  -d '{"language":"de","exam":"opic","level":"B1","topic":"test","durationMinutes":10,"contactMode":"immediate"}'
# 기대: 422 { "error": { "code": "validation_error", "message": "language/exam scope violation" } }

# 미지원 언어 시도
curl -X POST http://localhost:4000/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-jwt>" \
  -d '{"language":"ja","exam":"jlpt_n2","level":"N3","topic":"test","durationMinutes":10,"contactMode":"immediate"}'
# 기대: 422
```

---

## T-007 예약 세션 (Scheduled) — DE 기준

| 단계 | 행동 | 기대 결과 |
|------|------|-----------|
| 1 | Language = Deutsch, Contact Mode = Scheduled | 날짜/시간 입력 필드 표시 |
| 2 | 10분 후 시간 입력 → Create Session | "scheduled session created for..." |
| 3 | 예약 시간 10분 전부터 Join Session 버튼 활성화 | Join Session 버튼 표시 |
| 4 | Join Session → 통화 | 독일어 AI와 대화 |

---

## T-008 무료 통화 3회 한도 검증

| 단계 | 행동 | 기대 결과 |
|------|------|-----------|
| 1~3 | 세션 3회 생성 + 통화 완료 | 정상 진행 |
| 4 | 4번째 세션 생성 → Start Call | `402 insufficient_allowance` 에러 |
| 5 | Billing → Basic 플랜 mock 결제 | 잔여 분 충전됨 |
| 6 | 다시 Start Call | 정상 통화 시작 |

> **로컬 환경에서만 가능** (`NODE_ENV` ≠ production)
> Production에서는 mock-checkout 엔드포인트가 404 반환

---

## 자동화 테스트 실행

```bash
# 전체 단위 테스트 (48개)
pnpm --filter lingua-call-api test

# 파일별 실행
pnpm --filter lingua-call-api test languageExam   # 언어/시험 쌍 검증 (10개)
pnpm --filter lingua-call-api test sessionSchema  # Zod 스키마 검증 (21개)
pnpm --filter lingua-call-api test aiInstructions # AI 프롬프트 분기 (17개)
```

**테스트 파일 위치:**
- `apps/api/src/__tests__/languageExam.test.ts` — 허용/차단 페어 검증
- `apps/api/src/__tests__/sessionSchema.test.ts` — Zod 입력 유효성
- `apps/api/src/__tests__/aiInstructions.test.ts` — 언어별 AI 프롬프트 내용
