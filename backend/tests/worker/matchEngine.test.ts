import { describe, it, expect } from '@jest/globals';
import { checkCondition, evaluateHarness } from '../../src/worker/matchEngine';
import type { Condition } from '../../src/llm/schema';

describe('checkCondition', () => {
  it('PRICE_CHANGE: triggers when price drops 5%', () => {
    const condition: Condition = { indicator: 'PRICE_CHANGE', operator: 'lte', value: -5, unit: 'percent' };
    expect(checkCondition(condition, { price: 95, prevClose: 100, volume: 1000, prevVolume: 1000 })).toBe(true);
  });

  it('PRICE_CHANGE: does not trigger when drop is only 3%', () => {
    const condition: Condition = { indicator: 'PRICE_CHANGE', operator: 'lte', value: -5, unit: 'percent' };
    expect(checkCondition(condition, { price: 97, prevClose: 100, volume: 1000, prevVolume: 1000 })).toBe(false);
  });

  it('VOLUME_SURGE: triggers when volume doubles (200%)', () => {
    const condition: Condition = { indicator: 'VOLUME_SURGE', operator: 'gte', value: 200, unit: 'percent' };
    expect(checkCondition(condition, { price: 100, prevClose: 100, volume: 2500, prevVolume: 1000 })).toBe(true);
  });

  it('VOLUME_SURGE: does not trigger when volume only goes up 50%', () => {
    const condition: Condition = { indicator: 'VOLUME_SURGE', operator: 'gte', value: 200, unit: 'percent' };
    expect(checkCondition(condition, { price: 100, prevClose: 100, volume: 1500, prevVolume: 1000 })).toBe(false);
  });

  it('RSI indicator returns false (batch-only)', () => {
    const condition: Condition = { indicator: 'RSI', operator: 'lte', value: 30 };
    expect(checkCondition(condition, { price: 95, prevClose: 100, volume: 1000, prevVolume: 1000 })).toBe(false);
  });
});

describe('evaluateHarness', () => {
  it('OR logic: returns true when any realtime condition matches', () => {
    const conditions: Condition[] = [
      { indicator: 'PRICE_CHANGE', operator: 'lte', value: -5, unit: 'percent' },
      { indicator: 'VOLUME_SURGE', operator: 'gte', value: 200, unit: 'percent' },
    ];
    // price dropped 5%, volume did not surge
    expect(evaluateHarness(conditions, 'OR', { price: 95, prevClose: 100, volume: 1200, prevVolume: 1000 })).toBe(true);
  });

  it('AND logic: returns false when only one of two realtime conditions matches', () => {
    const conditions: Condition[] = [
      { indicator: 'PRICE_CHANGE', operator: 'lte', value: -5, unit: 'percent' },
      { indicator: 'VOLUME_SURGE', operator: 'gte', value: 200, unit: 'percent' },
    ];
    expect(evaluateHarness(conditions, 'AND', { price: 95, prevClose: 100, volume: 1200, prevVolume: 1000 })).toBe(false);
  });

  it('returns false when only batch conditions present', () => {
    const conditions: Condition[] = [
      { indicator: 'RSI', operator: 'lte', value: 30 },
    ];
    expect(evaluateHarness(conditions, 'OR', { price: 95, prevClose: 100, volume: 1000, prevVolume: 1000 })).toBe(false);
  });
});
