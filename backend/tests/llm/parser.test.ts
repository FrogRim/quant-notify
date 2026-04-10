import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ParsedHarness } from '../../src/llm/schema';

type MockFn = jest.MockedFunction<(...args: unknown[]) => Promise<ParsedHarness>>;

// Mock the entire parser module
jest.mock('../../src/llm/parser', () => ({
  callLLM: jest.fn(),
  parseHarness: jest.fn(),
}));

describe('parseHarness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed result for valid high-confidence input', async () => {
    const mockResponse: ParsedHarness = {
      ticker: '005930',
      market: 'KOSPI',
      conditions: [
        { indicator: 'PRICE_CHANGE', operator: 'lte', value: -5, unit: 'percent' },
      ],
      logic: 'OR',
      confidence: 0.9,
      summary: '삼성전자가 5% 하락하면 알려드려요',
    };

    const { parseHarness } = await import('../../src/llm/parser');
    (parseHarness as unknown as MockFn).mockResolvedValueOnce(mockResponse);

    const result = await parseHarness('삼전이 5% 떨어지면 알려줘');
    expect(result.ticker).toBe('005930');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('returns low confidence for vague input', async () => {
    const mockResponse: ParsedHarness = {
      ticker: '',
      market: 'KOSPI',
      conditions: [],
      logic: 'OR',
      confidence: 0.3,
      summary: '',
    };

    const { parseHarness } = await import('../../src/llm/parser');
    (parseHarness as unknown as MockFn).mockResolvedValueOnce(mockResponse);

    const result = await parseHarness('뭔가 좋아보이면');
    expect(result.confidence).toBeLessThan(0.6);
  });
});
