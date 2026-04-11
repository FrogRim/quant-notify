import cron from 'node-cron';
import { prisma } from '../db/client';
import { calculateRSI } from './indicators/rsi';
import { calculateMADeviation } from './indicators/maDeviation';
import { calculateMACD } from './indicators/macd';
import { sendPush } from '../pusher/pushClient';
import type { Condition } from '../llm/schema';

// Per-ticker historical price cache (in prod, replace with Redis)
const priceCache = new Map<string, number[]>();

export function startBatchScheduler() {
  // Weekdays 09:00–15:30 KST = UTC 00:00–06:30, run every 5 min
  cron.schedule('*/5 0-6 * * 1-5', runBatch, { timezone: 'Asia/Seoul' });
  console.log('[Scheduler] Batch scheduler started');
}

export function isValidCondition(c: unknown): c is Condition {
  if (typeof c !== 'object' || c === null) return false;
  const obj = c as Record<string, unknown>;
  return (
    typeof obj.indicator === 'string' &&
    typeof obj.operator === 'string' &&
    typeof obj.value === 'number'
  );
}

async function runBatch() {
  try {
    const harnesses = await prisma.harness.findMany({
      where: { active: true },
      include: { user: true },
    });

    const now = new Date();

    // Skip if outside Korean market hours (09:00–15:30 KST = 00:00–06:30 UTC)
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    if (utcHour > 6 || (utcHour === 6 && utcMin >= 30)) return;

    const cooldownMs = 60 * 60 * 1000; // 1 hour

    for (const harness of harnesses) {
      if (harness.lastAlertAt && now.getTime() - harness.lastAlertAt.getTime() < cooldownMs) {
        continue;
      }

      const batchConditions = (harness.conditions as unknown[])
        .filter(isValidCondition)
        .filter((c) => ['MA_DEVIATION', 'RSI', 'MACD'].includes(c.indicator));
      if (batchConditions.length === 0) continue;

      const prices = priceCache.get(harness.ticker) ?? [];

      // Compute minimum required prices per harness
      const minRequired = Math.max(
        ...batchConditions.map((c) => {
          if (c.indicator === 'MACD') return 35; // 26 + 9 (longPeriod + signalPeriod)
          if (c.indicator === 'RSI') return (c.period ?? 14) + 1;
          if (c.indicator === 'MA_DEVIATION') return c.period ?? 20;
          return 0;
        })
      );
      if (prices.length < minRequired) continue;

      const currentPrice = prices[prices.length - 1];
      const results = batchConditions.map((c) => {
        try {
          return checkBatchCondition(c, prices, currentPrice);
        } catch (err) {
          console.error(`[Scheduler] indicator error for harness ${harness.id} (${c.indicator}):`, err);
          return false;
        }
      });
      const triggered =
        harness.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);

      if (triggered) {
        const deeplink = `supertoss://stock?code=${harness.ticker}&market=${harness.market}`;
        await sendPush({ userKey: harness.user.tossUserKey, harness, price: currentPrice, deeplink });
        await prisma.harness.update({
          where: { id: harness.id },
          data: { lastAlertAt: now },
        });
      }
    }
  } catch (err) {
    console.error('[Scheduler] runBatch failed:', err);
  }
}

export function checkBatchCondition(condition: Condition, prices: number[], currentPrice: number): boolean {
  const { indicator, operator, value } = condition;
  let actual = 0;

  switch (indicator) {
    case 'RSI':
      actual = calculateRSI(prices, condition.period ?? 14);
      break;
    case 'MA_DEVIATION':
      actual = calculateMADeviation(prices, currentPrice, condition.period ?? 20);
      break;
    case 'MACD': {
      const { macdLine, signalLine } = calculateMACD(prices);
      if (operator === 'cross_up') return macdLine > signalLine;
      if (operator === 'cross_down') return macdLine < signalLine;
      actual = macdLine;
      break;
    }
    default:
      return false;
  }

  switch (operator) {
    case 'gte': return actual >= value;
    case 'lte': return actual <= value;
    case 'gt':  return actual > value;
    case 'lt':  return actual < value;
    default:    return false;
  }
}

export function updatePriceCache(ticker: string, price: number) {
  const prices = priceCache.get(ticker) ?? [];
  prices.push(price);
  if (prices.length > 100) prices.shift(); // keep max 100 entries
  priceCache.set(ticker, prices);
}
