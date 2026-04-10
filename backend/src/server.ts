// backend/src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';

const server = Fastify({ logger: true });

server.register(cors, {
  origin: [
    /^https:\/\/[^.]+\.apps\.tossmini\.com$/,
    /^https:\/\/[^.]+\.private-apps\.tossmini\.com$/,
  ],
});

server.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await server.listen({
      port: Number(process.env.PORT ?? 3000),
      host: process.env.HOST ?? '0.0.0.0',
    });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
