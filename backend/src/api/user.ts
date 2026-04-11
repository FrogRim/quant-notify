import { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';

export async function userRoutes(app: FastifyInstance) {
  app.post<{ Body: { tossUserKey: string } }>('/users', async (req, reply) => {
    const { tossUserKey } = req.body;

    if (!tossUserKey || typeof tossUserKey !== 'string') {
      return reply.status(400).send({ error: 'tossUserKey is required' });
    }

    const user = await prisma.user.upsert({
      where: { tossUserKey },
      update: {},
      create: { tossUserKey },
    });

    // 내부 필드 노출 방지 — 클라이언트에 필요한 필드만 반환
    return { plan: user.plan };
  });
}
