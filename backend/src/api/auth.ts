import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/client';

/**
 * x-toss-user-key 헤더에서 인증된 사용자를 추출한다.
 * 헤더 없음 또는 DB에 없는 키이면 401을 응답하고 null을 반환한다.
 * 호출 측에서 반드시 `if (!user) return;` 으로 얼리 리턴해야 한다.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const rawKey = req.headers['x-toss-user-key'];
  const tossUserKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!tossUserKey) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }
  const user = await prisma.user.findUnique({ where: { tossUserKey } });
  if (!user) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }
  return user;
}
