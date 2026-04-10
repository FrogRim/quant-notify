import { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';
import { Sensitivity } from '@prisma/client';
import { parseHarness } from '../llm/parser';

const FREE_PLAN_LIMIT = 3;

async function getUserByKey(tossUserKey: string) {
  return prisma.user.findUnique({ where: { tossUserKey } });
}

export async function harnessRoutes(app: FastifyInstance) {
  // 하니스 목록 조회
  app.get('/harnesses', async (req, reply) => {
    const rawKey = req.headers['x-toss-user-key'];
    const tossUserKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!tossUserKey) return reply.status(401).send({ error: 'Unauthorized' });
    const user = await getUserByKey(tossUserKey);
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    return prisma.harness.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  });

  // LLM 파싱 엔드포인트
  app.post<{ Body: { input: string } }>('/harnesses/parse', async (req, reply) => {
    const rawKey = req.headers['x-toss-user-key'];
    const tossUserKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!tossUserKey) return reply.status(401).send({ error: 'Unauthorized' });
    const user = await getUserByKey(tossUserKey);
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    if (!req.body.input || typeof req.body.input !== 'string') {
      return reply.status(400).send({ error: 'input is required' });
    }

    const result = await parseHarness(req.body.input);

    if (result.confidence < 0.6) {
      return reply.status(422).send({
        error: 'low_confidence',
        message: '좀 더 구체적으로 말씀해 주실 수 있나요? 예: "10% 떨어지면" 또는 "과매도 구간에 오면"',
        confidence: result.confidence,
      });
    }

    return result;
  });

  // 하니스 생성
  app.post<{
    Body: {
      ticker: string;
      market: string;
      conditions: unknown[];
      logic: string;
      sensitivity: string;
      summary: string;
    };
  }>('/harnesses', async (req, reply) => {
    const rawKey = req.headers['x-toss-user-key'];
    const tossUserKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!tossUserKey) return reply.status(401).send({ error: 'Unauthorized' });
    const user = await getUserByKey(tossUserKey);
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const validSensitivities = Object.values(Sensitivity) as string[];
    if (!validSensitivities.includes(req.body.sensitivity)) {
      return reply.status(400).send({ error: `Invalid sensitivity. Must be one of: ${validSensitivities.join(', ')}` });
    }

    if (!Array.isArray(req.body.conditions) || req.body.conditions.length === 0) {
      return reply.status(400).send({ error: 'conditions must be a non-empty array' });
    }

    try {
      const harness = await prisma.$transaction(async (tx) => {
        if (user.plan === 'FREE') {
          const count = await tx.harness.count({ where: { userId: user.id } });
          if (count >= FREE_PLAN_LIMIT) {
            throw Object.assign(new Error('FREE plan limit reached'), { statusCode: 403 });
          }
        }
        return tx.harness.create({
          data: {
            userId: user.id,
            ticker: req.body.ticker,
            market: req.body.market,
            conditions: req.body.conditions as object[],
            logic: req.body.logic,
            sensitivity: req.body.sensitivity as Sensitivity,
            summary: req.body.summary,
          },
        });
      });
      return reply.status(201).send(harness);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      if (e.statusCode === 403) {
        return reply.status(403).send({ error: e.message, limit: FREE_PLAN_LIMIT });
      }
      throw err; // Let global error handler catch it
    }
  });

  // 하니스 활성화 토글
  app.patch<{ Params: { id: string }; Body: { active: boolean } }>(
    '/harnesses/:id',
    async (req, reply) => {
      const rawKey = req.headers['x-toss-user-key'];
      const tossUserKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
      if (!tossUserKey) return reply.status(401).send({ error: 'Unauthorized' });
      const user = await getUserByKey(tossUserKey);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      if (typeof req.body.active !== 'boolean') {
        return reply.status(400).send({ error: 'active must be a boolean' });
      }

      const harness = await prisma.harness.findFirst({
        where: { id: req.params.id, userId: user.id },
      });
      if (!harness) return reply.status(404).send({ error: 'Not found' });

      return prisma.harness.update({
        where: { id: req.params.id },
        data: { active: req.body.active },
      });
    }
  );

  // 하니스 삭제
  app.delete<{ Params: { id: string } }>('/harnesses/:id', async (req, reply) => {
    const rawKey = req.headers['x-toss-user-key'];
    const tossUserKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!tossUserKey) return reply.status(401).send({ error: 'Unauthorized' });
    const user = await getUserByKey(tossUserKey);
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const harness = await prisma.harness.findFirst({
      where: { id: req.params.id, userId: user.id },
    });
    if (!harness) return reply.status(404).send({ error: 'Not found' });

    await prisma.harness.delete({ where: { id: req.params.id } });
    return { success: true };
  });
}
