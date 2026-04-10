import { Text } from './tds';

interface Props {
  label: string;
  min: number;
  max: number;
  value: number;
  unit: string;
  onChange: (val: number) => void;
}

export function ConditionSlider({ label, min, max, value, unit, onChange }: Props) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Text typography="body1">{label}</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <input
          type="range"
          aria-label={label}
          aria-valuetext={`${value}${unit}`}
          step={1}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <Text typography="body2">{value}{unit}</Text>
      </div>
    </div>
  );
}
