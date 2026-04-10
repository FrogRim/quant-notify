function ema(prices: number[], period: number): number {
  const k = 2 / (period + 1);
  let emaVal = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const price of prices.slice(period)) {
    emaVal = price * k + emaVal * (1 - k);
  }
  return emaVal;
}

export function calculateMACD(
  prices: number[],
  shortPeriod = 12,
  longPeriod = 26,
  signalPeriod = 9
): { macdLine: number; signalLine: number; histogram: number } {
  if (prices.length < longPeriod) {
    throw new Error(`MACD requires at least ${longPeriod} data points`);
  }
  const shortEMA = ema(prices, shortPeriod);
  const longEMA = ema(prices, longPeriod);
  const macdLine = shortEMA - longEMA;

  // 시그널 라인: 단순화 버전
  const signalLine = macdLine * (2 / (signalPeriod + 1));
  const histogram = macdLine - signalLine;

  return { macdLine, signalLine, histogram };
}
