import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Parse DATABASE_URL into pg.PoolConfig parts to work around a known issue
 * in pg v8's SASL/SCRAM implementation where the password is not properly
 * extracted from connection URIs, causing:
 *   "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"
 *
 * Passing connection parameters individually (host, port, database, user,
 * password) avoids the URI-parsing code path that triggers this bug.
 */
function createPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Check your .env or .env.local file.',
    );
  }

  const u = new URL(url);
  const config: pg.PoolConfig = {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    // Explicitly request md5 over SCRAM to avoid the pg SCRAM bug
    connectionTimeoutMillis: 5000,
  };

  return new pg.Pool(config);
}

let prismaClient: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient =
      globalForPrisma.prisma ??
      new PrismaClient({
        adapter: new PrismaPg(createPool()),
      });

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = prismaClient;
    }
  }
  return prismaClient;
}

/**
 * Lazy PrismaClient via Proxy — delays pg.Pool creation until the first
 * database query, guaranteeing process.env.DATABASE_URL has been loaded
 * by Next.js from .env* files.
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