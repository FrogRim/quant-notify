import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { buildServer } from '../../src/server';
import type { FastifyInstance } from 'fastify';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(() => { app = buildServer(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
