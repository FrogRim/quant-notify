import { Text } from './tds';

interface Props {
  summary: string;
}

export function SummaryCard({ summary }: Props) {
  return (
    <div style={{
      background: '#F9FAFB',
      borderRadius: 12,
      padding: 16,
      margin: '16px 0',
      border: '1px solid #E5E7EB',
    }}>
      <Text typography="body1">{summary}</Text>
    </div>
  );
}
