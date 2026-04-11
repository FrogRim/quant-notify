// backend/src/pusher/pushClient.ts
import { prisma } from '../db/client';
import { readFileSync } from 'fs';
import https from 'https';
import fetch from 'node-fetch';

const PUSH_API_URL = 'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-message';

// mTLS 인증서 설정
function createAgent(): https.Agent {
  if (process.env.NODE_ENV === 'production' && (!process.env.MTLS_CERT || !process.env.MTLS_KEY)) {
    throw new Error('MTLS_CERT and MTLS_KEY are required in production');
  }
  return new https.Agent({
    cert: process.env.MTLS_CERT ? readFileSync(process.env.MTLS_CERT) : undefined,
    key:  process.env.MTLS_KEY  ? readFileSync(process.env.MTLS_KEY)  : undefined,
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
        console.error(`[Pusher] Failed after ${MAX_RETRIES} attempts:`, err);
        // 실패 이력 로깅 (DB 연결 실패 시 console.error로 폴백)
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
          console.error('[Pusher] Failed to record failed push to DB:', dbErr);
        }
      } else {
        // 지수 백오프: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
}
