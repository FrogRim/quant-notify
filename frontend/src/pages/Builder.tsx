import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Text, Button, ProgressBar } from '../components/tds';
import { api } from '../api/client';
import { ConditionSlider } from '../components/ConditionSlider';
import { SummaryCard } from '../components/SummaryCard';

type Sensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

interface Condition {
  indicator: string;
  operator: string;
  value: number;
  unit?: string;
  period?: number;
}

interface ParsedHarness {
  ticker: string;
  market: string;
  conditions: Condition[];
  logic: string;
  summary: string;
}

export function Builder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedHarness | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('MEDIUM');
  const [errorMsg, setErrorMsg] = useState('');

  const parseMutation = useMutation({
    mutationFn: () => api.parseHarness(input) as Promise<ParsedHarness>,
    onSuccess: (data) => {
      setParsed(data);
      setErrorMsg('');
      setStep(2);
    },
    onError: () => {
      setErrorMsg('좀 더 구체적으로 말씀해 주실 수 있나요? 예: "10% 떨어지면" 또는 "과매도 구간에 오면"');
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createHarness({
        ticker: parsed!.ticker,
        market: parsed!.market,
        conditions: parsed!.conditions,
        logic: parsed!.logic,
        summary: parsed!.summary,
        sensitivity,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['harnesses'] });
      navigate('/dashboard');
    },
    onError: () => {
      setErrorMsg('하니스 생성에 실패했어요. 다시 시도해 주세요.');
    },
  });

  const updateConditionValue = (index: number, value: number) => {
    if (!parsed) return;
    const newConditions = parsed.conditions.map((c, i) =>
      i === index ? { ...c, value } : c
    );
    setParsed({ ...parsed, conditions: newConditions });
  };

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <ProgressBar value={(step / 4) * 100} />

      {/* Step 1: Natural language input */}
      {step === 1 && (
        <div style={{ marginTop: 16 }}>
          <Text typography="title2">어떤 상황에서 알림을 받고 싶으세요?</Text>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 삼전이 많이 떨어지면 알려줘"
            style={{
              width: '100%',
              height: 100,
              marginTop: 12,
              padding: 12,
              borderRadius: 8,
              border: '1px solid #E5E7EB',
              fontSize: 14,
              resize: 'none',
              boxSizing: 'border-box',
            }}
          />
          {errorMsg && <Text typography="body2" color="danger" style={{ marginTop: 8 }}>{errorMsg}</Text>}
          <Button
            variant="primary"
            size="large"
            style={{ marginTop: 16, width: '100%' }}
            onClick={() => parseMutation.mutate()}
            disabled={!input.trim() || parseMutation.isPending}
          >
            {parseMutation.isPending ? 'AI가 분석 중이에요...' : '다음'}
          </Button>
        </div>
      )}

      {/* Step 2: Review AI suggestion and adjust sliders */}
      {step === 2 && parsed && (
        <div style={{ marginTop: 16 }}>
          <Text typography="title2">AI가 이렇게 이해했어요</Text>
          <SummaryCard summary={parsed.summary} />
          {parsed.conditions
            .filter((c) => c.indicator === 'PRICE_CHANGE')
            .map((c, i) => (
              <ConditionSlider
                key={i}
                label="가격 변동 기준"
                min={-20}
                max={-1}
                value={c.value}
                unit="%"
                onChange={(val) => updateConditionValue(i, val)}
              />
            ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="secondary" size="large" onClick={() => setStep(1)} style={{ flex: 1 }}>이전</Button>
            <Button variant="primary" size="large" onClick={() => setStep(3)} style={{ flex: 1 }}>다음</Button>
          </div>
        </div>
      )}

      {/* Step 3: Sensitivity */}
      {step === 3 && (
        <div style={{ marginTop: 16 }}>
          <Text typography="title2">얼마나 예민하게 반응할까요?</Text>
          {(['LOW', 'MEDIUM', 'HIGH'] as Sensitivity[]).map((s) => (
            <Button
              key={s}
              variant={sensitivity === s ? 'primary' : 'secondary'}
              size="large"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => setSensitivity(s)}
            >
              {s === 'LOW' ? '둔감하게 (큰 신호만)' : s === 'MEDIUM' ? '적당하게' : '기민하게 (작은 신호에도)'}
            </Button>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="secondary" size="large" onClick={() => setStep(2)} style={{ flex: 1 }}>이전</Button>
            <Button variant="primary" size="large" onClick={() => setStep(4)} style={{ flex: 1 }}>다음</Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm and activate */}
      {step === 4 && parsed && (
        <div style={{ marginTop: 16 }}>
          <Text typography="title2">하니스를 시작할까요?</Text>
          <SummaryCard summary={parsed.summary} />
          {errorMsg && <Text typography="body2" color="danger" style={{ marginBottom: 8 }}>{errorMsg}</Text>}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="secondary" size="large" onClick={() => setStep(3)} style={{ flex: 1 }}>이전</Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              style={{ flex: 1 }}
            >
              {createMutation.isPending ? '생성 중...' : '하니스 시작하기'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
