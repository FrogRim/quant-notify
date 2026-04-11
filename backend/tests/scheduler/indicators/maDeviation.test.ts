import { describe, it, expect } from '@jest/globals';
import { calculateMADeviation } from '../../../src/scheduler/indicators/maDeviation';

describe('calculateMADeviation', () => {
  it('returns 0 when price equals MA', () => {
    const prices = Array(20).fill(100);
    expect(calculateMADeviation(prices, 100)).toBeCloseTo(0);
  });

  it('returns -5 when price is 5% below MA', () => {
    const prices = Array(20).fill(100);
    expect(calculateMADeviation(prices, 95)).toBeCloseTo(-5);
  });

  it('throws when fewer than 20 data points', () => {
    expect(() => calculateMADeviation([100, 99], 100)).toThrow('MA deviation requires at least 20 data points');
  });
});
