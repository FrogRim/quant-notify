import WebSocket from 'ws';
import { prisma } from '../db/client';
import { evaluateHarness } from './matchEngine';
import { sendPush } from '../pusher/pushClient';
import type { Condition } from '../llm/schema';
import { updatePriceCache } from '../scheduler/batchRunner';

if (!process.env.KIS_WS_URL) {
  throw new Error('KIS_WS_URL environment variable is not set');
}
if (!process.env.KIS_APPROVAL_KEY) {
  throw new Error('KIS_APPROVAL_KEY environment variable is not set');
}
const KIS_WS_URL: string = process.env.KIS_WS_URL;
let ws: WebSocket | null = null;
let reconnectDelay = 1000;

function isConditionArray(v: unknown): v is Condition[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Record<string, unknown>).indicator === 'string' &&
        typeof (c as Record<string, unknown>).operator === 'string' &&
        typeof (c as Record<string, unknown>).value === 'number'
    )
  );
}

export function startKISWorker(): void {
  connect();
}

function connect(): void {
  ws = new WebSocket(KIS_WS_URL);

  ws.on('open', () => {
    reconnectDelay = 1000;
    subscribeActiveHarnesses().catch((err: unknown) => {
      console.error('[KIS] Failed to subscribe:', err);
    });
  });

  ws.on('message', (data: Buffer) => {
    const message = data.toString();
    if (message.startsWith('0|H0STCNT0')) {
      handleTick(message).catch((err: unknown) => {
        console.error('[KIS] Tick handling error:', err);
      });
    }
  });

  ws.on('close', () => {
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    setTimeout(connect, delay);
  });

  ws.on('error', (err: Error) => {
    console.error('[KIS] WebSocket error:', err.message);
  });
}

async function subscribeActiveHarnesses(): Promise<void> {
  const tickers = await prisma.harness.findMany({
    where: { active: true },
    select: { ticker: true },
    distinct: ['ticker'],
  });

  for (const { ticker } of tickers) {
    ws?.send(JSON.stringify({
      header: { approval_key: process.env.KIS_APPROVAL_KEY, tr_type: '1' },
      body: { input: { tr_id: 'H0STCNT0', tr_key: ticker } },
    }));
  }
}

async function handleTick(raw: string): Promise<void> {
  const parts = raw.split('|');
  if (parts.length < 4) return;

  const fields = parts[3].split('^');
  const ticker     = fields[0];
  const price      = parseFloat(fields[2]);
  const prevClose  = parseFloat(fields[25]);
  const volume     = parseFloat(fields[13]);
  const prevVolume = parseFloat(fields[14]);

  if ([price, prevClose, volume].some(Number.isNaN)) {
    console.warn('[KIS] Malformed tick, skipping:', fields[0]);
    return;
  }

  const tick = {
    price,
    prevClose,
    volume,
    prevVolume: Number.isNaN(prevVolume) || prevVolume === 0 ? 1 : prevVolume,
  };

  // Feed the current price into the batch price cache
  updatePriceCache(ticker, price);

  const harnesses = await prisma.harness.findMany({
    where: { ticker, active: true },
    include: { user: true },
  });

  const now = new Date();
  const cooldownMs = 60 * 60 * 1000; // 1 hour cooldown

  for (const harness of harnesses) {
    if (harness.lastAlertAt && now.getTime() - harness.lastAlertAt.getTime() < cooldownMs) {
      continue;
    }

    const rawConditions = harness.conditions;
    if (!isConditionArray(rawConditions)) {
      console.error('[KIS] Invalid conditions shape for harness', harness.id);
      continue;
    }
    const triggered = evaluateHarness(rawConditions, harness.logic as 'AND' | 'OR', tick);

    if (triggered) {
      const deeplink = `supertoss://stock?code=${harness.ticker}&market=${harness.market}`;
      await sendPush({ userKey: harness.user.tossUserKey, harness, price, deeplink });
      await prisma.harness.update({
        where: { id: harness.id },
        data: { lastAlertAt: now },
      });
    }
  }
}
