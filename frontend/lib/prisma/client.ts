import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Lazy PrismaClient that defers initialization until the first database
 * query. This guarantees that process.env.DATABASE_URL has been loaded
 * by Next.js before we attempt to connect.
 *
 * IMPORTANT: We do NOT use @prisma/adapter-pg here because the driver
 * adapter has a known compatibility issue with SCRAM-SHA-256 (SASL)
 * authentication — the pg library's SCRAM implementation receives
 * `undefined` for the password during the handshake, causing:
 *   "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"
 *
 * Prisma's built-in query engine handles SCRAM authentication correctly
 * without a driver adapter.
 */
let prismaClient: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient =
      globalForPrisma.prisma ?? new PrismaClient();

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = prismaClient;
    }
  }
  return prismaClient;
}

/**
 * Proxy that lazily initializes the PrismaClient on first property access.
 * This ensures the database connection is only established after Next.js
 * has loaded environment variables from .env* files.
 */
export const prisma = new Proxy<PrismaClient>({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});