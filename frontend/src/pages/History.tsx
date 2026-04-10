import { useQuery, useMutation } from '@tanstack/react-query';
import { Text, ListRow } from '../components/tds';
import { api } from '../api/client';

interface AlertItem {
  id: string;
  priceAt: number;
  deeplink: string;
  clicked: boolean;
  sentAt: string;
  harness: { summary: string; ticker: string };
}

export function History() {
  const { data: alerts = [], isLoading, isError } = useQuery({
    queryKey: ['alerts'],
    queryFn: api.getAlerts,
  });

  const clickMutation = useMutation({
    mutationFn: (id: string) => api.clickAlert(id),
  });

  const handleClick = (alert: AlertItem) => {
    clickMutation.mutate(alert.id);
    window.location.href = alert.deeplink;
  };

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
        <Text typography="body2" color="danger">알림 목록을 불러오지 못했어요.</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <Text typography="title2" style={{ marginBottom: 8 }}>알림 이력</Text>
      {(alerts as AlertItem[]).length === 0 ? (
        <Text typography="body2" color="secondary">아직 받은 알림이 없어요.</Text>
      ) : (
        (alerts as AlertItem[]).map((alert) => (
          <ListRow
            key={alert.id}
            title={alert.harness.ticker}
            description={`${alert.harness.summary} — ${Number(alert.priceAt).toLocaleString('ko-KR')}원`}
            right={
              <Text typography="caption1" color={alert.clicked ? 'secondary' : 'primary'}>
                {alert.clicked ? '확인함' : '확인하기'}
              </Text>
            }
            onClick={() => handleClick(alert)}
          />
        ))
      )}
    </div>
  );
}
