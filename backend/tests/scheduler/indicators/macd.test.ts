import { describe, it, expect } from '@jest/globals';
import { calculateMACD } from '../../../src/scheduler/indicators/macd';

describe('calculateMACD', () => {
  it('returns positive MACD when short EMA > long EMA (uptrend)', () => {
    // 상승 추세: 최근 가격이 높음
    const prices = Array.from({ length: 26 }, (_, i) => 100 + i);
    const { macdLine } = calculateMACD(prices);
    expect(macdLine).toBeGreaterThan(0);
  });

  it('throws when fewer than 26 data points', () => {
    expect(() => calculateMACD([100, 101])).toThrow('MACD requires at least 26 data points');
  });

  it('returns histogram = macdLine - signalLine', () => {
    const prices = Array.from({ length: 26 }, (_, i) => 100 + i);
    const { macdLine, signalLine, histogram } = calculateMACD(prices);
    expect(histogram).toBeCloseTo(macdLine - signalLine);
  });
});
