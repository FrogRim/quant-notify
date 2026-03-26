export type LocalizedCopy = ReturnType<typeof getFriendlyCopy>;

const COPY = {
  en: {
    common: {
      privacy: 'Privacy',
      terms: 'Terms',
      quickPractice: 'Short, light, steady practice'
    },
    login: {
      eyebrow: 'Friendly AI speaking practice',
      title: 'Practice speaking in short calls that actually fit your day.',
      description:
        'LinguaCall helps you build a steady speaking habit with fast setup, short sessions, and simple feedback after each call.',
      bullets: [
        'Start with a short session instead of a long study block.',
        'Use phone OTP once, then stay signed in on your device.',
        'Move from practice to paid plans only when it feels worth it.'
      ],
      primaryCta: 'Start with phone verification',
      secondaryCta: 'See plans first',
      valueTitle: 'Why people trust it',
      valueSummary:
        'The product keeps the first step small: one number, one quick call, one clear next action.'
    },
    verify: {
      eyebrow: 'Quick verification',
      title: 'Confirm your phone number and step straight into practice.',
      description:
        'This only takes a moment. After the first verification, the app keeps your session active on this device.',
      stepsTitle: 'What happens next',
      steps: [
        'Enter your number and request a one-time code.',
        'Confirm the code to create your secure session.',
        'Start a short practice call or browse plans when you are ready.'
      ],
      supportTitle: 'Built to feel low pressure',
      supportCopy:
        'You are not signing up for a complicated platform. The goal is to let you start speaking quickly.'
    },
    session: {
      eyebrow: 'Practice hub',
      title: 'Keep speaking practice short enough to stay consistent.',
      description:
        'Use a quick session when you have a few minutes, schedule the next one when you want structure, and come back to reports when you need feedback.',
      quickActionsTitle: 'Start with one clear action',
      quickActions: [
        {
          title: 'Start a short session',
          description: 'Create a new call in a few taps and jump into speaking.'
        },
        {
          title: 'Check your next reservation',
          description: 'See upcoming sessions before you lose track of them.'
        },
        {
          title: 'Review one recent report',
          description: 'Use the last report as a gentle next-step guide.'
        }
      ],
      composerTitle: 'Create your next session',
      composerDescription:
        'Immediate sessions are best when you want to talk right now. Scheduled sessions are better when you want a little structure.',
      historyTitle: 'Recent sessions',
      historyDescription:
        'Track what is upcoming, what is live, and what already has a report ready.',
      liveTitle: 'Live call',
      liveDescription:
        'Keep the focus on connection status, transcript, and a clean end-call action.',
      detailTitle: 'Session detail',
      detailDescription:
        'Use this panel for transcripts and reports without crowding the main action area.'
    },
    billing: {
      eyebrow: 'Plans and billing',
      title: 'Choose the plan that makes short, repeatable practice easy to keep.',
      description:
        'The goal is not to buy the biggest plan. It is to find a monthly rhythm that feels light enough to keep using.',
      trustPoints: [
        'Simple monthly pricing',
        'Short-session friendly',
        'Clear upgrade path when you want more minutes'
      ],
      currentPlanTitle: 'Your current access',
      currentPlanDescription:
        'See what is active now, then compare the next step without digging through account settings.',
      plansTitle: 'Choose the pace that feels sustainable',
      plansDescription:
        'Each plan is framed around short calls, repeat practice, and a clear monthly limit.'
    },
    report: {
      eyebrow: 'Practice report',
      title: 'Turn one short session into a clear next speaking target.',
      description:
        'Reports should feel like coaching, not paperwork. Read the summary first, then use the details when you need them.',
      summaryTitle: 'What to focus on next',
      scoreTitle: 'Score snapshot',
      correctionsTitle: 'Corrections worth noticing',
      fluencyTitle: 'Speaking rhythm'
    }
  },
  ko: {
    common: {
      privacy: '개인정보처리방침',
      terms: '이용약관',
      quickPractice: '짧고 가볍게 꾸준히 연습'
    },
    login: {
      eyebrow: '부담 없이 시작하는 AI 회화 연습',
      title: '긴 공부 대신, 일상에 들어오는 짧은 회화 연습부터 시작하세요.',
      description:
        'LinguaCall은 빠른 시작, 짧은 세션, 간단한 피드백으로 말하기 연습을 꾸준히 이어가도록 돕습니다.',
      bullets: [
        '긴 학습 블록 대신 짧은 통화 세션으로 시작합니다.',
        '전화번호 OTP를 한 번만 거치면 이 기기에서 로그인 상태를 유지합니다.',
        '유료 플랜은 직접 써보고 가치가 느껴질 때 선택하면 됩니다.'
      ],
      primaryCta: '전화번호로 시작하기',
      secondaryCta: '플랜 먼저 보기',
      valueTitle: '신뢰감을 먼저 만드는 이유',
      valueSummary:
        '처음 단계는 작아야 합니다. 번호 입력, 짧은 통화, 다음 행동 하나만 명확하면 됩니다.'
    },
    verify: {
      eyebrow: '빠른 본인 확인',
      title: '전화번호만 확인하면 바로 연습을 시작할 수 있습니다.',
      description:
        '처음 한 번만 인증하면 됩니다. 이후에는 이 기기에서 세션을 유지해 매번 OTP를 요구하지 않습니다.',
      stepsTitle: '인증 후 바로 가능한 것',
      steps: [
        '전화번호를 입력하고 인증 코드를 받습니다.',
        '코드를 확인하면 안전한 로그인 세션이 만들어집니다.',
        '즉시 통화를 시작하거나, 준비가 되면 플랜을 비교할 수 있습니다.'
      ],
      supportTitle: '복잡한 가입 흐름을 만들지 않습니다',
      supportCopy:
        '중요한 건 빨리 말하기 연습을 시작하는 것입니다. 인증 과정도 그 흐름을 방해하지 않아야 합니다.'
    },
    session: {
      eyebrow: '연습 허브',
      title: '짧은 세션을 꾸준히 이어갈 수 있도록 연습 흐름을 단순하게 만듭니다.',
      description:
        '지금 바로 한 번 말하고, 필요하면 예약을 잡고, 리포트는 나중에 다시 꺼내보세요. 핵심 행동만 먼저 보이게 정리했습니다.',
      quickActionsTitle: '가장 먼저 할 행동부터',
      quickActions: [
        {
          title: '짧은 세션 바로 시작',
          description: '몇 번의 선택만으로 새 통화를 만들고 바로 말하기를 시작합니다.'
        },
        {
          title: '다음 예약 확인',
          description: '예정된 세션을 한눈에 보고 놓치지 않도록 합니다.'
        },
        {
          title: '최근 리포트 다시 보기',
          description: '지난 피드백을 바로 복습하고 다음 통화에 반영합니다.'
        }
      ],
      composerTitle: '다음 세션 만들기',
      composerDescription:
        '지금 바로 말하고 싶다면 즉시 세션, 일정에 맞춰 연습하고 싶다면 예약 세션이 더 잘 맞습니다.',
      historyTitle: '최근 세션',
      historyDescription:
        '예약, 진행 중 세션, 리포트가 준비된 완료 세션까지 한 흐름에서 확인합니다.',
      liveTitle: '진행 중 통화',
      liveDescription:
        '통화 중에는 연결 상태와 transcript, 종료 동작만 또렷하게 보이도록 정리합니다.',
      detailTitle: '세션 상세',
      detailDescription:
        '리포트와 transcript는 별도 패널로 분리해 메인 행동 영역이 복잡해지지 않게 합니다.'
    },
    billing: {
      eyebrow: '플랜과 결제',
      title: '짧은 연습을 꾸준히 이어가기 쉬운 플랜을 고르세요.',
      description:
        '가장 큰 플랜을 사는 것이 목표가 아닙니다. 한 달 동안 무리 없이 계속 사용할 수 있는 리듬을 찾는 것이 더 중요합니다.',
      trustPoints: ['단순한 월 구독 구조', '짧은 세션 중심 설계', '필요할 때만 자연스럽게 업그레이드'],
      currentPlanTitle: '현재 이용 상태',
      currentPlanDescription:
        '지금 활성화된 플랜을 먼저 확인하고, 다음 단계가 필요할 때만 비교할 수 있게 구성했습니다.',
      plansTitle: '지속 가능한 속도로 선택하기',
      plansDescription:
        '각 플랜은 짧은 통화, 반복 연습, 명확한 월 사용량을 기준으로 설계되어 있습니다.'
    },
    report: {
      eyebrow: '연습 리포트',
      title: '짧은 세션 하나를 다음 말하기 목표로 연결합니다.',
      description:
        '리포트는 서류처럼 느껴지면 안 됩니다. 먼저 요약을 보고, 필요할 때만 세부 항목을 펼쳐보면 됩니다.',
      summaryTitle: '다음에 집중할 한 가지',
      scoreTitle: '점수 요약',
      correctionsTitle: '바로 눈에 들어와야 하는 교정',
      fluencyTitle: '말하기 리듬'
    }
  }
} as const;

export function getFriendlyCopy(locale: string) {
  return locale.startsWith('ko') ? COPY.ko : COPY.en;
}

export function getPlanPresentation(locale: string, planCode: string) {
  const isKo = locale.startsWith('ko');
  const map = {
    free: isKo
      ? {
          label: '가볍게 체험',
          audience: '처음 한두 번 짧게 말해보고 싶은 사람',
          highlights: ['체험 통화', '짧은 첫 연습', '부담 없는 시작']
        }
      : {
          label: 'Try it lightly',
          audience: 'For people who want a few short calls before paying',
          highlights: ['Trial calls', 'Short first practice', 'Low-pressure start']
        },
    basic: isKo
      ? {
          label: '꾸준한 짧은 연습',
          audience: '짧게라도 자주 말하고 싶은 사람',
          highlights: ['짧은 통화 습관', '월 포함 분수', '가장 무난한 선택']
        }
      : {
          label: 'Steady short practice',
          audience: 'For people who want a light, repeatable speaking habit',
          highlights: ['Short-call habit', 'Monthly minutes', 'Balanced default choice']
        },
    pro: isKo
      ? {
          label: '더 자주, 더 구조적으로',
          audience: '예약과 리포트를 더 적극적으로 활용하고 싶은 사람',
          highlights: ['더 많은 분수', '리포트 활용', '예약 중심 루틴']
        }
      : {
          label: 'More structure, more repetition',
          audience: 'For people who want more minutes and stronger report usage',
          highlights: ['More minutes', 'Report habit', 'Reservation-friendly routine']
        }
  } as const;

  return map[planCode as keyof typeof map] ?? (isKo
    ? {
        label: '지속 가능한 연습',
        audience: '말하기 연습을 매달 이어가고 싶은 사람',
        highlights: ['월 구독', '짧은 통화', '꾸준한 사용']
      }
    : {
        label: 'Sustainable practice',
        audience: 'For people building a monthly speaking habit',
        highlights: ['Monthly plan', 'Short calls', 'Repeatable use']
      });
}

export function getLanguageDisplayName(code: string) {
  const names: Record<string, string> = {
    en: 'English / OPIC',
    de: 'Deutsch / Goethe B2',
    zh: 'Chinese / HSK 5',
    es: 'Espanol / DELE B1',
    ja: 'Japanese / JLPT N2',
    fr: 'Francais / DELF B1'
  };

  return names[code] ?? code.toUpperCase();
}
