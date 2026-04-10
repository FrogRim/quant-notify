import Fastify from 'fastify';
import cors from '@fastify/cors';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: [
      /^https:\/\/[^.]+\.apps\.tossmini\.com$/,
      /^https:\/\/[^.]+\.private-apps\.tossmini\.com$/,
    ],
  });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}

async function start() {
  const app = buildServer();
  try {
    await app.listen({
      port: Number(process.env.PORT ?? 3000),
      host: process.env.HOST ?? '0.0.0.0',
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
