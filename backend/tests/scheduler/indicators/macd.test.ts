import { describe, it, expect } from '@jest/globals';
import { calculateMACD } from '../../../src/scheduler/indicators/macd';

describe('calculateMACD', () => {
  it('returns positive MACD when short EMA > long EMA (uptrend)', () => {
    // 상승 추세: 최근 가격이 높음 — need longPeriod + signalPeriod = 35 points
    const prices = Array.from({ length: 35 }, (_, i) => 100 + i);
    const { macdLine } = calculateMACD(prices);
    expect(macdLine).toBeGreaterThan(0);
  });

  it('throws when fewer than 35 data points', () => {
    expect(() => calculateMACD([100, 101])).toThrow('MACD requires at least 35 data points');
  });

  it('returns histogram = macdLine - signalLine', () => {
    const prices = Array.from({ length: 35 }, (_, i) => 100 + i);
    const { macdLine, signalLine, histogram } = calculateMACD(prices);
    expect(histogram).toBeCloseTo(macdLine - signalLine, 10);
  });

  it('signalLine differs from macdLine (not a simple multiplier)', () => {
    const prices = Array.from({ length: 35 }, (_, i) => 100 + i);
    const { macdLine, signalLine } = calculateMACD(prices);
    // Signal line is EMA of MACD series, not macdLine * 0.2
    expect(signalLine).not.toBeCloseTo(macdLine * 0.2, 5);
  });
});
