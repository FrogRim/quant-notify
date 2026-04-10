import Fastify from 'fastify';
import cors from '@fastify/cors';
import { userRoutes } from './api/user';
import { harnessRoutes } from './api/harness';
import { alertRoutes } from './api/alert';

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

  app.register(userRoutes);
  app.register(harnessRoutes);
  app.register(alertRoutes);

  app.setErrorHandler((error, _req, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
    return reply.status(statusCode).send({ error: error.message });
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
    const { startKISWorker } = await import('./worker/kisClient');
    const { startBatchScheduler } = await import('./scheduler/batchRunner');
    startKISWorker();
    startBatchScheduler();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
