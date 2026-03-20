import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';

export default function ScreenTerms() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto">
      <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
        ← 뒤로
      </Button>
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>
      <div className="prose prose-sm text-foreground space-y-4">
        <p>
          본 약관은 LinguaCall(이하 "서비스")이 제공하는 AI 기반 언어 학습 통화 서비스의 이용에
          관한 조건을 규정합니다.
        </p>

        <h2 className="text-lg font-semibold mt-6">제1조 (목적)</h2>
        <p>
          본 약관은 서비스 이용 조건 및 절차, 이용자와 서비스 간의 권리·의무 관계를 규정하는 것을
          목적으로 합니다.
        </p>

        <h2 className="text-lg font-semibold mt-6">제2조 (서비스 이용)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>만 14세 이상이면 서비스를 이용할 수 있습니다.</li>
          <li>회원가입 시 정확한 정보를 제공해야 합니다.</li>
          <li>계정 및 비밀번호 관리 책임은 이용자에게 있습니다.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">제3조 (결제 및 환불)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>구독 요금은 결제일 기준으로 청구됩니다.</li>
          <li>결제 후 7일 이내, 서비스 미이용 시 전액 환불됩니다.</li>
          <li>서비스 이용 후에는 부분 환불이 적용될 수 있습니다.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">제4조 (금지 행위)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>서비스의 무단 복제, 배포, 상업적 이용 금지</li>
          <li>타인의 계정 도용 또는 부정 이용 금지</li>
          <li>서비스 운영을 방해하는 행위 금지</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">제5조 (서비스 변경 및 중단)</h2>
        <p>
          서비스는 기술적 사유, 운영 정책 변경 등으로 인해 내용이 변경되거나 중단될 수 있으며,
          사전에 공지합니다.
        </p>

        <h2 className="text-lg font-semibold mt-6">제6조 (책임 제한)</h2>
        <p>
          서비스는 천재지변, 통신 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.
        </p>

        <h2 className="text-lg font-semibold mt-6">제7조 (분쟁 해결)</h2>
        <p>
          본 약관에 관한 분쟁은 대한민국 법률에 따르며, 관할 법원은 서울중앙지방법원으로 합니다.
        </p>

        <p className="text-xs text-muted-foreground mt-8">시행일: 2026년 3월 20일</p>
      </div>
    </div>
  );
}
