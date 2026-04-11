import { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';
import { requireAuth } from './auth';

export async function alertRoutes(app: FastifyInstance) {
  // 알림 이력 조회
  app.get('/alerts', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;

    return prisma.alert.findMany({
      where: { userId: user.id },
      orderBy: { sentAt: 'desc' },
      take: 50,
      include: { harness: { select: { summary: true, ticker: true } } },
    });
  });

  // 딥링크 클릭 추적
  app.post<{ Params: { id: string } }>('/alerts/:id/click', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;

    const alertRecord = await prisma.alert.findFirst({
      where: { id: req.params.id, userId: user.id },
    });
    if (!alertRecord) return reply.status(404).send({ error: 'Not found' });

    await prisma.alert.update({
      where: { id: req.params.id },
      data: { clicked: true },
    });
    return { success: true };
  });
}
