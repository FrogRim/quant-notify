import { ParsedHarness } from './schema';

const SYSTEM_PROMPT = `
당신은 투자 자연어를 기술 지표 JSON으로 변환하는 전문가입니다.
지원 지표: PRICE_CHANGE(가격변동률), VOLUME_SURGE(거래량급증), MA_DEVIATION(이동평균이격도), RSI, MACD

다음 JSON 형식으로만 응답하세요:
{
  "ticker": "종목코드",
  "market": "KOSPI|KOSDAQ|NASDAQ|NYSE",
  "conditions": [
    { "indicator": "지표타입", "operator": "gte|lte|gt|lt|cross_up|cross_down", "value": 숫자, "unit": "percent|absolute", "period": 숫자(선택) }
  ],
  "logic": "AND|OR",
  "confidence": 0~1,
  "summary": "사용자에게 보여줄 한국어 요약"
}
`.trim();

export async function callLLM(input: string): Promise<ParsedHarness> {
  const apiKey = process.env.LLM_API_KEY;
  const apiUrl = process.env.LLM_API_URL;

  if (!apiKey || !apiUrl) {
    throw new Error('LLM_API_KEY and LLM_API_URL must be set');
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(data.choices[0].message.content) as ParsedHarness;
}

export async function parseHarness(input: string): Promise<ParsedHarness> {
  const result = await callLLM(input);
  return result;
}
