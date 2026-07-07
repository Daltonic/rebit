import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Lazily create a pg.Pool so that process.env.DATABASE_URL is guaranteed to
 * be loaded (Next.js processes .env* files before the first request, but
 * module-level code runs during server startup where env vars may not yet
 * be available to imported modules).
 */
function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn(
      'DATABASE_URL is not set. Database operations will fail until it is configured.',
    );
  }
  return new pg.Pool({ connectionString });
}

/** Cached pool – reset on hot-reload in dev via globalThis */
function getPool(): pg.Pool {
  const g = globalThis as { __rebitPool?: pg.Pool };
  if (!g.__rebitPool) {
    g.__rebitPool = createPool();
  }
  return g.__rebitPool;
}

/**
 * Lazily-initialized PrismaClient.
 *
 * The pool is NOT created at module-import time. Instead, we store a factory
 * and instantiate the PrismaClient on first access. This guarantees that
 * process.env.DATABASE_URL has been loaded by Next.js before we attempt to
 * connect.
 */
let prismaClient: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient =
      globalForPrisma.prisma ??
      new PrismaClient({
        adapter: new PrismaPg(getPool()),
      });

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = prismaClient;
    }
  }
  return prismaClient;
}

/**
 * Export a proxy that lazily initializes the PrismaClient on first property
 * access. This ensures the pg.Pool is only created after Next.js has loaded
 * environment variables from .env* files.
 */
export const prisma = new Proxy<PrismaClient>({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      // Bind methods so `this` refers to the PrismaClient instance
      return value.bind(client);
    }
    return value;
  },
});