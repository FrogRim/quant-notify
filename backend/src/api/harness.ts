import { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';
import { Sensitivity } from '@prisma/client';
import { parseHarness } from '../llm/parser';
import { requireAuth } from './auth';

const FREE_PLAN_LIMIT = 3;

const VALID_MARKETS = new Set(['KOSPI', 'KOSDAQ', 'NASDAQ', 'NYSE']);
const VALID_LOGIC = new Set(['AND', 'OR']);

export async function harnessRoutes(app: FastifyInstance) {
  // 하니스 목록 조회
  app.get('/harnesses', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;

    return prisma.harness.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  });

  // LLM 파싱 엔드포인트 — LLM 비용 보호: 15분에 10회 제한
  app.post<{ Body: { input: string } }>(
    '/harnesses/parse',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;

    if (!req.body.input || typeof req.body.input !== 'string') {
      return reply.status(400).send({ error: 'input is required' });
    }
    // (length check is now inside parseHarness itself)

    try {
      const result = await parseHarness(req.body.input);

      if (result.confidence < 0.6) {
        return reply.status(422).send({
          error: 'low_confidence',
          message: '좀 더 구체적으로 말씀해 주실 수 있나요? 예: "10% 떨어지면" 또는 "과매도 구간에 오면"',
          confidence: result.confidence,
        });
      }

      return result;
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      if (e.statusCode === 400) {
        return reply.status(400).send({ error: e.message });
      }
      app.log.error(err);
      return reply.status(503).send({ error: 'llm_unavailable', message: 'AI 서비스에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  });  // ← app.post('/harnesses/parse') 닫힘

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
    const user = await requireAuth(req, reply);
    if (!user) return;

    const { ticker, market, logic, sensitivity, conditions, summary } = req.body;

    if (!ticker || typeof ticker !== 'string' || ticker.length > 20) {
      return reply.status(400).send({ error: 'ticker must be a non-empty string (max 20 chars)' });
    }
    if (!VALID_MARKETS.has(market)) {
      return reply.status(400).send({ error: `market must be one of: ${[...VALID_MARKETS].join(', ')}` });
    }
    if (!VALID_LOGIC.has(logic)) {
      return reply.status(400).send({ error: 'logic must be AND or OR' });
    }
    if (typeof summary !== 'string' || summary.length > 200) {
      return reply.status(400).send({ error: 'summary must be a string (max 200 chars)' });
    }

    const validSensitivities = Object.values(Sensitivity) as string[];
    if (!validSensitivities.includes(sensitivity)) {
      return reply.status(400).send({ error: `Invalid sensitivity. Must be one of: ${validSensitivities.join(', ')}` });
    }

    if (!Array.isArray(conditions) || conditions.length === 0) {
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
            ticker,
            market,
            conditions: conditions as object[],
            logic,
            sensitivity: sensitivity as Sensitivity,
            summary,
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
      const user = await requireAuth(req, reply);
      if (!user) return;

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
    const user = await requireAuth(req, reply);
    if (!user) return;

    const harness = await prisma.harness.findFirst({
      where: { id: req.params.id, userId: user.id },
    });
    if (!harness) return reply.status(404).send({ error: 'Not found' });

    await prisma.harness.delete({ where: { id: req.params.id } });
    return { success: true };
  });
}
