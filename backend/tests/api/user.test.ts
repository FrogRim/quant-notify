import { describe, it, expect, afterEach, beforeAll, afterAll } from '@jest/globals';
import { buildServer } from '../../src/server';
import { prisma } from '../../src/db/client';
import type { FastifyInstance } from 'fastify';

describe('POST /users', () => {
  let app: FastifyInstance;

  beforeAll(() => { app = buildServer(); });
  afterAll(async () => { await app.close(); });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { tossUserKey: 'test-user-key' } });
  });

  it('creates user on first login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { tossUserKey: 'test-user-key' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ tossUserKey: string; plan: string }>();
    expect(body.tossUserKey).toBe('test-user-key');
    expect(body.plan).toBe('FREE');
  });

  it('returns existing user on subsequent login', async () => {
    await app.inject({
      method: 'POST',
      url: '/users',
      payload: { tossUserKey: 'test-user-key' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { tossUserKey: 'test-user-key' },
    });
    expect(res.statusCode).toBe(200);
  });
});
