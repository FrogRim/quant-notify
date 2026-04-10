import type { Condition } from '../llm/schema';

export interface TickData {
  price: number;
  prevClose: number;
  volume: number;
  prevVolume: number;
}

export function checkCondition(condition: Condition, tick: TickData): boolean {
  const { indicator, operator, value } = condition;

  let actual: number;

  switch (indicator) {
    case 'PRICE_CHANGE':
      actual = ((tick.price - tick.prevClose) / tick.prevClose) * 100;
      break;
    case 'VOLUME_SURGE':
      actual = (tick.volume / tick.prevVolume) * 100;
      break;
    default:
      return false; // RSI/MA/MACD are batch-only
  }

  switch (operator) {
    case 'gte': return actual >= value;
    case 'lte': return actual <= value;
    case 'gt':  return actual > value;
    case 'lt':  return actual < value;
    default:    return false;
  }
}

export function evaluateHarness(
  conditions: Condition[],
  logic: 'AND' | 'OR',
  tick: TickData
): boolean {
  const realtimeConditions = conditions.filter(
    (c) => c.indicator === 'PRICE_CHANGE' || c.indicator === 'VOLUME_SURGE'
  );
  if (realtimeConditions.length === 0) return false;

  const results = realtimeConditions.map((c) => checkCondition(c, tick));
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}
