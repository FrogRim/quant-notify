export function calculateMADeviation(prices: number[], currentPrice: number, period = 20): number {
  if (prices.length < period) {
    throw new Error(`MA deviation requires at least ${period} data points`);
  }
  const ma = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
  return ((currentPrice - ma) / ma) * 100;
}
