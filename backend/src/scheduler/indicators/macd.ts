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
  if (prices.length < longPeriod + signalPeriod) {
    throw new Error(`MACD requires at least ${longPeriod + signalPeriod} data points`);
  }

  // Build MACD line series over all valid windows
  const macdSeries: number[] = [];
  for (let i = longPeriod; i <= prices.length; i++) {
    const slice = prices.slice(0, i);
    macdSeries.push(ema(slice, shortPeriod) - ema(slice, longPeriod));
  }

  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = ema(macdSeries, signalPeriod);
  const histogram = macdLine - signalLine;

  return { macdLine, signalLine, histogram };
}
