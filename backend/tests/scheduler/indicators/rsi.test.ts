import { describe, it, expect } from '@jest/globals';
import { calculateRSI } from '../../../src/scheduler/indicators/rsi';

describe('calculateRSI', () => {
  it('returns 0 when all changes are losses', () => {
    const prices = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86];
    expect(calculateRSI(prices)).toBe(0);
  });

  it('returns 100 when all changes are gains', () => {
    const prices = [86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];
    expect(calculateRSI(prices)).toBe(100);
  });

  it('returns ~50 for alternating prices', () => {
    const prices = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100];
    const rsi = calculateRSI(prices);
    expect(rsi).toBeGreaterThan(40);
    expect(rsi).toBeLessThan(60);
  });

  it('throws when fewer than 15 data points provided', () => {
    expect(() => calculateRSI([100, 99, 98])).toThrow('RSI requires at least 15 data points');
  });

  it('Wilder smoothing: longer series produces different result than seed-only', () => {
    const shortSeries = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86];
    const longSeries = [...shortSeries, 87, 88, 89, 90]; // additional recovery data
    const shortRSI = calculateRSI(shortSeries);
    const longRSI = calculateRSI(longSeries);
    // The extra recovery candles should increase RSI
    expect(longRSI).toBeGreaterThan(shortRSI);
  });
});
