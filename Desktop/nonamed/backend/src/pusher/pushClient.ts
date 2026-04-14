// backend/src/pusher/pushClient.ts
import { prisma } from '../db/client';
import { getLogger } from '../logger';
import { readFileSync } from 'fs';
import https from 'https';
import fetch from 'node-fetch';

const PUSH_API_URL = 'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-message';
const logger = getLogger({ module: 'pusher.pushClient' });

// mTLS 인증서 설정 — 인증서가 없으면 경고만 하고 agent를 undefined로 둠
function createAgent(): https.Agent | undefined {
  if (!process.env.MTLS_CERT || !process.env.MTLS_KEY) {
    logger.warn('MTLS_CERT / MTLS_KEY not set — push notifications will be disabled');
    return undefined;
  }
  return new https.Agent({
    cert: readFileSync(process.env.MTLS_CERT),
    key:  readFileSync(process.env.MTLS_KEY),
    rejectUnauthorized: true,
  });
}

const agent = createAgent();

export interface SendPushParams {
  userKey: string;
  harness: { id: string; userId: string; summary: string };
  price: number;
  deeplink: string;
}

export async function sendPush({ userKey, harness, price, deeplink }: SendPushParams): Promise<void> {
  if (!agent) {
    logger.warn({ harnessId: harness.id }, 'Push skipped: mTLS agent not configured');
    return;
  }

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(PUSH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-toss-user-key': userKey,
        },
        body: JSON.stringify({
          templateSetCode: 'harness_triggered_v1',
          context: {
            summary: harness.summary,
            price: price.toLocaleString('ko-KR'),
            deeplink,
          },
        }),
        agent,
      });

      if (!res.ok) throw new Error(`Push API error: ${res.status}`);

      // Alert 이력 저장 (성공)
      await prisma.alert.create({
        data: {
          harnessId: harness.id,
          userId: harness.userId,
          triggeredBy: 'HARNESS',
          priceAt: price,
          deeplink,
        },
      });

      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        logger.error({ err, attempt, maxRetries: MAX_RETRIES, harnessId: harness.id, userId: harness.userId }, 'Push delivery failed after retries');
        try {
          await prisma.alert.create({
            data: {
              harnessId: harness.id,
              userId: harness.userId,
              triggeredBy: 'HARNESS_FAILED',
              priceAt: price,
              deeplink,
            },
          });
        } catch (dbErr) {
          logger.error({ err: dbErr, harnessId: harness.id, userId: harness.userId }, 'Failed to record failed push to DB');
        }
      } else {
        // 지수 백오프: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
}
