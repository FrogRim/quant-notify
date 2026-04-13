# quant-notify

> 토스증권 사용자가 자연어로 투자 직관을 입력하면, AI가 복합 기술 지표 조건으로 변환하여 조건 충족 시 실시간 푸시 알림을 발송하는 앱인토스 미니앱

---

## 문제 정의

토스증권 사용자는 투자 직관은 있지만 기술적 지표를 모른다. 기존 알림은 "가격 몇 원"만 설정 가능해서, 복합 시장 신호를 스스로 정의하고 감시할 방법이 없다.

| 기존 증권사 앱 | quant-notify |
|---|---|
| "삼성전자 6만원 되면 알려줘" → 단순 가격 트리거 | "삼전이 요즘 너무 떨어진 것 같은데" → AI가 RSI·이동평균·MACD 복합 조건 자동 계산 |

---

## 핵심 컨셉

자연어로 말한 투자 직관을 AI가 복합 기술 지표로 번역하여, 비전공자도 퀀트 수준의 조건 알림을 받을 수 있게 한다.

**규제 전략**: 직접 자동매매 대신 "조건 충족 알림(Push)" 방식. 사용자가 최종 매매 결정 → 유사투자자문업 규제 회피, MVP 무료(광고 기반)로 대가성 없음.

---

## 타겟 사용자

토스증권 계좌 보유 + 장중 시장 모니터링이 불가능한 직장인·주부 등 투자 경험 1년 이상의 비전공자

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Vite + React 18 + TypeScript + @toss/tds-mobile |
| 백엔드 | Node.js + Fastify + TypeScript + Prisma |
| DB | PostgreSQL |
| LLM | TBD (자연어 → 지표 파싱) |
| 시세 데이터 | KIS Open API (WebSocket 실시간) |
| 인증 | 앱인토스 토스 로그인 (userKey) |
| 푸시 | 앱인토스 Push API |
| 딥링크 | `supertoss://` scheme → 토스증권 종목 상세 |
| 테스트 | Vitest |

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────┐
│           토스 앱 (앱인토스)              │
│  ┌──────────────────────────────────┐   │
│  │   WebView (Vite+React+TS)        │   │
│  │   - 하니스 빌더 (자연어 입력)      │   │
│  │   - 대시보드 (활성 하니스 목록)    │   │
│  │   - 알림 이력                     │   │
│  └──────────┬───────────────────────┘   │
│             │ REST API                  │
└─────────────┼───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│         Backend (Fastify + TS)          │
│                                         │
│  ┌─────────┐  ┌──────────┐             │
│  │   api/  │  │   llm/   │             │
│  │ (CRUD)  │  │ (파싱)   │             │
│  └─────────┘  └──────────┘             │
│  ┌──────────────────────────────────┐  │
│  │  worker/ (KIS WebSocket)         │  │
│  │  실시간: 가격변동률·거래량 매칭    │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  scheduler/ (5분 배치)           │  │
│  │  복합: RSI·MA·MACD 계산·매칭     │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  pusher/ → 앱인토스 Push API     │  │
│  │           → supertoss:// 딥링크  │  │
│  └──────────────────────────────────┘  │
│                    │                   │
│         PostgreSQL (Prisma)            │
└─────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│        KIS Open API (WebSocket)         │
│        실시간 시세 스트림                │
└─────────────────────────────────────────┘
```

### 핵심 데이터 흐름

```
사용자 자연어 입력
  → llm/ 모듈이 JSON 조건으로 파싱
  → DB에 하니스 저장
  → worker(실시간) / scheduler(배치)가 KIS 시세와 조건 매칭
  → 조건 충족 → pusher가 토스 푸시 발송
  → 사용자 클릭 → supertoss:// → 토스증권
```

---

## 모니터링 방식 (하이브리드)

| 구분 | 대상 지표 | 방식 | 지연 |
|------|----------|------|------|
| 실시간 | 가격변동률, 거래량급증 | KIS WebSocket 틱 이벤트 | 즉시 |
| 배치 | 이동평균이격도, RSI, MACD | 5분 주기 스케줄러 | 최대 5분 |

---

## MVP 지원 지표 (5종)

| 지표 | 자연어 예시 | 계산 방식 |
|------|------------|----------|
| 가격변동률 | "5% 떨어지면" | 실시간 |
| 거래량급증 | "갑자기 거래 많아지면" | 실시간 |
| 이동평균 이격도 | "평균보다 많이 떨어지면" | 배치 (20일 기준) |
| RSI | "과매도 구간에 오면" | 배치 (14일 기준) |
| MACD 크로스 | "추세가 바뀌는 것 같으면" | 배치 (골든/데드크로스) |

---

## LLM 파싱 스키마

**입력:**
```
"엔비디아가 좀 싸지면 알려줘"
```

**출력 (JSON):**
```typescript
{
  ticker: "NVDA",
  market: "NASDAQ",
  conditions: [
    { indicator: "PRICE_CHANGE", operator: "lte", value: -5, unit: "percent" },
    { indicator: "MA_DEVIATION", period: 20, operator: "lte", value: -5, unit: "percent" }
  ],
  logic: "OR",
  confidence: 0.87,
  summary: "NVDA가 20일 평균보다 5% 저렴해지면 알려드려요"
}
```

**신뢰도 기준:**
- `confidence >= 0.6` → 정상 파싱, UI에 결과 표시
- `confidence < 0.6` → 재입력 요청
- LLM API 장애 → 수동 설정 UI fallback

---

## 데이터 모델

```prisma
model User {
  id          String    @id @default(cuid())
  tossUserKey String    @unique
  plan        Plan      @default(FREE)
  harnesses   Harness[]
  alerts      Alert[]
  createdAt   DateTime  @default(now())
}

enum Plan { FREE  PAID }

model Harness {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  ticker      String
  market      String
  conditions  Json
  logic       String
  sensitivity String    // "LOW" | "MEDIUM" | "HIGH"
  summary     String
  active      Boolean   @default(true)
  lastAlertAt DateTime?
  alerts      Alert[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([userId])
  @@index([ticker, active])
}

model Alert {
  id          String   @id @default(cuid())
  harnessId   String
  harness     Harness  @relation(fields: [harnessId], references: [id])
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  triggeredBy String
  priceAt     Float
  deeplink    String
  clicked     Boolean  @default(false)
  sentAt      DateTime @default(now())
}
```

---

## 프로젝트 구조

```
quant-notify/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx          # 인기 하니스 템플릿 + 만들기 버튼
│   │   │   ├── Builder.tsx       # 하니스 빌더 4단계
│   │   │   ├── Dashboard.tsx     # 내 하니스 목록
│   │   │   ├── History.tsx       # 알림 이력
│   │   │   └── Settings.tsx      # 플랜 / 한도 확인
│   │   ├── components/
│   │   │   ├── HarnessCard.tsx
│   │   │   ├── ConditionSlider.tsx
│   │   │   └── SummaryCard.tsx
│   │   └── api/client.ts
│   └── package.json
│
└── backend/
    ├── src/
    │   ├── api/          # harness, user, alert 라우트
    │   ├── llm/          # 자연어 파싱
    │   ├── worker/       # KIS WebSocket + 실시간 매칭
    │   ├── scheduler/    # 5분 배치 + RSI/MACD/MA 계산
    │   ├── pusher/       # 앱인토스 Push API
    │   └── db/           # Prisma 클라이언트
    ├── prisma/schema.prisma
    └── package.json
```

---

## 화면 구조

```
/              → 홈 (인기 하니스 템플릿 + "만들기" 버튼)
/builder       → 하니스 빌더 (자연어 입력 → 4단계 설정)
/dashboard     → 내 하니스 목록 + 활성/일시정지 토글
/history       → 알림 수신 이력
/settings      → 계정 설정 (플랜, 하니스 한도 확인)
```

### 하니스 빌더 4단계
```
Step 1. 자연어 입력    "엔비디아가 좀 싸지면 알려줘"
Step 2. AI 제안 확인   종목·조건을 슬라이더로 조정
Step 3. 알림 설정      민감도·수신 주기 선택
Step 4. 활성화         요약 카드 확인 후 하니스 시작
```

---

## 하니스 한도

| 플랜 | 하니스 수 |
|------|----------|
| 무료 | 3개 |
| 유료 | TBD |

---

## 에러 처리

| 시나리오 | 처리 |
|---------|------|
| KIS WebSocket 장애 | 지수 백오프 재연결 → 3회 실패 시 배치 fallback |
| Push API 실패 | 최대 3회 재시도 → Alert 레코드 failed 기록 |
| LLM 파싱 실패 | 재입력 요청 또는 수동 설정 UI fallback |
| 장 마감 (15:30 KST) | worker 일시정지, 개장(09:00) 시 재시작 |
| 무료 한도 초과 | 생성 차단 + 업그레이드 바텀시트 |

---

## MVP 성공 기준

- [ ] 자연어 입력 → 하니스 생성까지 60초 이내
- [ ] LLM 파싱 정확도: 비전공자 10명 기준 80% 이상 의도 일치
- [ ] 알림 → 딥링크 클릭 전환율 15% 이상
- [ ] KIS WebSocket 장애 시 배치 fallback 자동 전환 확인
- [ ] 앱인토스 4단계 검수 통과

---

## MVP 제외 항목

| 항목 | 이유 |
|------|------|
| 해외주식 | 시세 소스 복잡도, v2에서 |
| 백테스트 | LLM 파싱 신뢰도 먼저 검증 후 |
| 하니스 마켓플레이스 | 유사투자자문업 리스크, 라이선스 취득 후 |
| 자동 매매 | 투자일임업 등록 필요 |

---

## 수익 모델

**MVP (광고 기반):**
- 하니스 대시보드 배너 광고
- 알림 메시지 내 토스증권 제휴 네이티브 광고
- 토스증권 딥링크 트래픽 기여 내부 정산

**Future:**
- 하니스 마켓플레이스 (자본시장법 투자자문업 등록 후)

---

## Open Questions

- [ ] LLM 모델 확정 (TBD)
- [ ] KIS API 법인 계좌 약관 확인 (한국투자증권 파트너 문의)
- [ ] `supertoss://` 딥링크 종목별 파라미터 스펙 확인
- [ ] 유료 플랜 하니스 한도 및 가격 결정
- [ ] 백엔드 배포 인프라 선택
