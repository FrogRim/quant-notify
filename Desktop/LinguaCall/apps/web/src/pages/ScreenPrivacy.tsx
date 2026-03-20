import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';

export default function ScreenPrivacy() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto">
      <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
        ← 뒤로
      </Button>
      <h1 className="text-2xl font-bold mb-6">개인정보처리방침</h1>
      <div className="prose prose-sm text-foreground space-y-4">
        <p>
          LinguaCall(이하 "서비스")은 이용자의 개인정보를 중요하게 여기며, 「개인정보 보호법」(PIPA) 및
          EU 일반 데이터 보호 규정(GDPR)을 준수합니다.
        </p>

        <h2 className="text-lg font-semibold mt-6">1. 수집하는 개인정보 항목</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>이름, 이메일 주소</li>
          <li>전화번호(국내 번호, 인증 목적)</li>
          <li>결제 정보(카드 정보는 결제 대행사가 보관하며 서비스는 보관하지 않습니다)</li>
          <li>서비스 이용 기록, 통화 내용(학습 평가 목적)</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">2. 개인정보의 수집 및 이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>서비스 제공 및 회원 관리</li>
          <li>AI 언어 학습 평가 리포트 생성</li>
          <li>결제 및 구독 관리</li>
          <li>고객 지원 및 공지사항 전달</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">3. 개인정보의 보유 및 이용 기간</h2>
        <p>
          회원 탈퇴 시 즉시 파기하며, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
        </p>

        <h2 className="text-lg font-semibold mt-6">4. 제3자 제공</h2>
        <p>
          이용자의 동의 없이 제3자에게 개인정보를 제공하지 않습니다. 단, 법령에 의한 경우는 예외입니다.
        </p>

        <h2 className="text-lg font-semibold mt-6">5. 이용자의 권리 (GDPR)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>접근권, 정정권, 삭제권, 처리 제한권, 이동권</li>
          <li>문의: support@linguacall.app</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">6. 문의처</h2>
        <p>개인정보 보호 책임자: support@linguacall.app</p>

        <p className="text-xs text-muted-foreground mt-8">최종 업데이트: 2026년 3월</p>
      </div>
    </div>
  );
}
