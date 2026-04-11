import { describe, it, expect, jest, afterEach, beforeAll } from '@jest/globals';
import { ParsedHarness } from '../../src/llm/schema';

const mockFetch = jest.fn<typeof global.fetch>();
global.fetch = mockFetch;

function makeLLMResponse(harness: ParsedHarness): Response {
  const body = JSON.stringify({
    choices: [{ message: { content: JSON.stringify(harness) } }],
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// Import after setting global.fetch so the module picks up our mock
import { callLLM, parseHarness } from '../../src/llm/parser';

describe('callLLM', () => {
  afterEach(() => { jest.clearAllMocks(); });

  beforeAll(() => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_API_URL = 'https://api.example.com/v1/chat/completions';
  });

  it('parses a valid LLM response', async () => {
    const mockHarness: ParsedHarness = {
      ticker: '005930', market: 'KOSPI',
      conditions: [{ indicator: 'PRICE_CHANGE', operator: 'lte', value: -5, unit: 'percent' }],
      logic: 'OR', confidence: 0.9,
      summary: '삼성전자가 5% 하락하면 알려드려요',
    };
    mockFetch.mockResolvedValueOnce(makeLLMResponse(mockHarness));
    const result = await callLLM('삼전이 5% 떨어지면');
    expect(result.ticker).toBe('005930');
    expect(result.confidence).toBe(0.9);
  });

  it('throws on non-200 status', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 429, statusText: 'Too Many Requests' }));
    await expect(callLLM('test')).rejects.toThrow('LLM API error: 429');
  });

  it('throws when LLM returns empty choices', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(callLLM('test')).rejects.toThrow('LLM returned empty or malformed response');
  });
});

describe('parseHarness', () => {
  it('throws 400 when input exceeds 500 chars', async () => {
    const longInput = 'a'.repeat(501);
    await expect(parseHarness(longInput)).rejects.toMatchObject({ statusCode: 400 });
  });
});
