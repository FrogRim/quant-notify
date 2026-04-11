// backend/src/db/client.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Lazy singleton — throws only when first accessed, not at import time
let _prisma: PrismaClient | undefined;
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      _prisma = createPrismaClient();
    }
    const value = (_prisma as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(_prisma) : value;
  },
});
