import { describe, it, expect } from '@jest/globals';
import { buildServer } from '../../src/server';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });
});
