import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Text, Button } from '../components/tds';
import { api } from '../api/client';
import { HarnessCard } from '../components/HarnessCard';

export function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data: harnesses = [], isLoading, isError } = useQuery({
    queryKey: ['harnesses'],
    queryFn: api.getHarnesses,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.toggleHarness(id, active),
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['harnesses'] });
    },
    onError: () => setMutationError('상태 변경에 실패했어요. 다시 시도해 주세요.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteHarness(id),
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['harnesses'] });
    },
    onError: () => setMutationError('삭제에 실패했어요. 다시 시도해 주세요.'),
  });

  if (isLoading) {
    return (
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <Text typography="body2" color="secondary">불러오는 중...</Text>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <Text typography="body2" color="danger">목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <Text typography="title2" style={{ marginBottom: 16 }}>내 하니스</Text>
      {mutationError && (
        <Text typography="body2" color="danger" style={{ marginBottom: 8 }}>{mutationError}</Text>
      )}
      {harnesses.length === 0 ? (
        <Text typography="body2" color="secondary">
          아직 하니스가 없어요. 하나 만들어볼까요?
        </Text>
      ) : (
        harnesses.map((h) => (
          <HarnessCard
            key={h.id}
            harness={h}
            onToggle={(id, active) => toggleMutation.mutate({ id, active })}
            onDelete={(id) => deleteMutation.mutate(id)}
            disabled={toggleMutation.isPending || deleteMutation.isPending}
          />
        ))
      )}
      <Button
        variant="primary"
        size="large"
        style={{ marginTop: 24, width: '100%' }}
        onClick={() => navigate('/builder')}
      >
        새 하니스 만들기
      </Button>
    </div>
  );
}
