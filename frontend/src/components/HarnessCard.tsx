import type { Harness } from '../types/harness';
import { Text, Badge, Button } from './tds';

interface Props {
  harness: Harness;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export function HarnessCard({ harness, onToggle, onDelete, disabled = false }: Props) {
  return (
    <div style={{
      padding: '16px 0',
      borderBottom: '1px solid #F2F4F6',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div style={{ flex: 1, marginRight: 12 }}>
        <Text typography="body1">{harness.ticker}</Text>
        <Text typography="body2" color="secondary">{harness.summary}</Text>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Badge variant={harness.active ? 'primary' : 'secondary'}>
          {harness.active ? '감시 중' : '일시정지'}
        </Badge>
        <Button
          size="small"
          variant="secondary"
          onClick={() => onToggle(harness.id, !harness.active)}
          disabled={disabled}
        >
          {harness.active ? '정지' : '시작'}
        </Button>
        <Button
          size="small"
          variant="secondary"
          onClick={() => onDelete(harness.id)}
          disabled={disabled}
        >
          삭제
        </Button>
      </div>
    </div>
  );
}
