import WebSocket from 'ws';
import { prisma } from '../db/client';
import { evaluateHarness } from './matchEngine';
import { sendPush } from '../pusher/pushClient';
import type { Condition } from '../llm/schema';

const KIS_WS_URL = process.env.KIS_WS_URL ?? 'ws://ops.koreainvestment.com:21000';
let ws: WebSocket | null = null;
let reconnectDelay = 1000;

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
  const prevVolume = parseFloat(fields[14]) || 1;

  const tick = { price, prevClose, volume, prevVolume };

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

    const triggered = evaluateHarness(
      harness.conditions as unknown as Condition[],
      harness.logic as 'AND' | 'OR',
      tick
    );

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
