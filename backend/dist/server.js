"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/server.ts
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const server = (0, fastify_1.default)({ logger: true });
server.register(cors_1.default, {
    origin: [
        'https://*.apps.tossmini.com',
        'https://*.private-apps.tossmini.com',
    ],
});
server.get('/health', async () => {
    return { status: 'ok' };
});
const start = async () => {
    try {
        await server.listen({ port: 3000, host: '0.0.0.0' });
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
start();
