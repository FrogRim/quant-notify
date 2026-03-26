import { useTranslation } from 'react-i18next';
import { StaticDocumentPage } from '../components/layout/StaticDocumentPage';

export default function ScreenPrivacy() {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  return (
    <StaticDocumentPage
      eyebrow={isKo ? '개인정보 처리 안내' : 'Privacy notice'}
      title={isKo ? '개인정보처리방침' : 'Privacy Policy'}
      updatedAt="2026-03-20"
      locale={i18n.language}
    >
      <section className="space-y-3">
        <p>
          {isKo
            ? 'LinguaCall은 사용자의 개인정보를 서비스 제공에 필요한 범위에서만 처리합니다. 본 문서는 현재 MVP 기준으로 어떤 정보를 수집하고, 어떤 목적으로 사용하며, 언제 삭제하는지 설명합니다.'
            : 'LinguaCall processes personal data only to the extent required to operate the service. This policy explains what we collect, why we collect it, and when it is removed under the current MVP launch setup.'}
        </p>
      </section>

      <section className="space-y-3">
        <h2>{isKo ? '1. 수집하는 정보' : '1. Data we collect'}</h2>
        <ul>
          <li>{isKo ? '전화번호 및 인증 상태' : 'Phone number and verification status'}</li>
          <li>{isKo ? '세션 생성 기록, 통화 메타데이터, 리포트 결과' : 'Session records, call metadata, and report results'}</li>
          <li>{isKo ? '구독 및 결제 상태 정보' : 'Subscription and billing status information'}</li>
          <li>{isKo ? '서비스 운영에 필요한 로그와 보안 이벤트' : 'Operational logs and security events required to run the service'}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>{isKo ? '2. 정보 이용 목적' : '2. Why we use it'}</h2>
        <ul>
          <li>{isKo ? '전화번호 OTP 인증 및 계정 보호' : 'Phone OTP authentication and account protection'}</li>
          <li>{isKo ? '실시간 회화 세션 제공 및 세션 기록 유지' : 'Realtime speaking sessions and session history'}</li>
          <li>{isKo ? '리포트 생성 및 학습 피드백 제공' : 'Report generation and learning feedback'}</li>
          <li>{isKo ? '결제 확인, 구독 유지, 고객 지원 대응' : 'Billing confirmation, subscription management, and support'}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>{isKo ? '3. 보관 기간' : '3. Retention'}</h2>
        <p>
          {isKo
            ? '계정과 세션 데이터는 서비스 운영 및 결제 이력 확인에 필요한 기간 동안 보관합니다. 법령상 보존 의무가 없는 정보는 서비스 운영 목적이 끝나면 삭제 또는 비식별화합니다.'
            : 'Account and session data are retained only for the period needed to operate the service and confirm billing history. Data without an ongoing operational or legal need is deleted or de-identified.'}
        </p>
      </section>

      <section className="space-y-3">
        <h2>{isKo ? '4. 제3자 제공 및 외부 처리' : '4. Third-party processing'}</h2>
        <p>
          {isKo
            ? '서비스는 OpenAI, Toss Payments, SOLAPI, Supabase 등 외부 서비스와 연동됩니다. 이들은 각자의 역할에 필요한 범위 안에서만 데이터를 처리합니다.'
            : 'The service integrates with providers such as OpenAI, Toss Payments, SOLAPI, and Supabase. Each provider processes data only within the scope required for its role.'}
        </p>
      </section>

      <section className="space-y-3">
        <h2>{isKo ? '5. 이용자의 권리' : '5. Your rights'}</h2>
        <p>
          {isKo
            ? '사용자는 본인의 정보에 대한 열람, 수정, 삭제를 요청할 수 있습니다. 계정 또는 개인정보 처리 관련 문의는 support@linguacall.shop 으로 접수합니다.'
            : 'You may request access to, correction of, or deletion of your data. Contact support@linguacall.shop for account or privacy requests.'}
        </p>
      </section>
    </StaticDocumentPage>
  );
}
