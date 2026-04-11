"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
(0, vitest_1.describe)('GET /health', () => {
    (0, vitest_1.it)('returns 200 with status ok', async () => {
        const app = (0, server_1.buildServer)();
        const res = await app.inject({ method: 'GET', url: '/health' });
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(JSON.parse(res.body)).toEqual({ status: 'ok' });
    });
});
