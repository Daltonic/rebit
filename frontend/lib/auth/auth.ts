/**
 * NextAuth configuration backed by database-stored secrets.
 *
 * Instead of reading secrets like AUTH_SECRET from environment variables
 * at module load time, this module lazily initializes NextAuth using
 * values persisted in the `app_settings` table.
 *
 * Only `DATABASE_URL` is required as an environment variable. All other
 * configuration (auth secret, OAuth credentials, etc.) can be configured
 * through the setup wizard and stored in the database.
 */
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { authConfig } from './auth.config';
import { prisma } from '@/lib/prisma/client';

// ── Lazy NextAuth Instance ──────────────────────────────────────────────
// We use a module-level variable so the instance is created at most once,
// but we defer creation until the first `auth()` or `handlers` call.
let nextAuthInstance:
  | {
      auth: ReturnType<typeof NextAuth>['auth'];
      handlers: ReturnType<typeof NextAuth>['handlers'];
      signIn: ReturnType<typeof NextAuth>['signIn'];
      signOut: ReturnType<typeof NextAuth>['signOut'];
    }
  | undefined;

async function getNextAuth(): Promise<any> {
  if (nextAuthInstance) return nextAuthInstance;

  // Try to read the auth secret from the database first
  let secret: string | undefined;
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
      select: { authSecret: true },
    });
    if (settings?.authSecret) {
      secret = settings.authSecret;
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  // Fallback to environment variable
  if (!secret) {
    secret = process.env.AUTH_SECRET ?? undefined;
  }

  // If no secret is available at all, return a mock instance.
  // During initial setup, the secret may not be configured yet.
  // Creating a NextAuth instance without a secret would log a noisy
  // MissingSecret error. The mock instance returns null for auth()
  // (treating every request as unauthenticated) and passes through
  // handlers as no-ops.
  if (!secret) {
    const mock = {
      auth: async () => null,
      handlers: {
        GET: async (req: any) => new Response('Not configured', { status: 503 }),
        POST: async (req: any) => new Response('Not configured', { status: 503 }),
      },
      signIn: async () => { throw new Error('Auth not configured'); },
      signOut: async () => { throw new Error('Auth not configured'); },
    };
    nextAuthInstance = mock as any;
    return nextAuthInstance;
  }

  // Try to read OAuth provider config from the database
  let googleClientId: string | undefined;
  let googleClientSecret: string | undefined;
  let githubClientId: string | undefined;
  let githubClientSecret: string | undefined;
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
      select: {
        googleClientId: true,
        googleClientSecret: true,
        githubClientId: true,
        githubClientSecret: true,
      },
    });
    if (settings) {
      googleClientId = settings.googleClientId ?? undefined;
      googleClientSecret = settings.googleClientSecret ?? undefined;
      githubClientId = settings.githubClientId ?? undefined;
      githubClientSecret = settings.githubClientSecret ?? undefined;
    }
  } catch {
    // DB unavailable — fall through to env vars
  }

  // Fallback to environment variables for OAuth providers
  if (!googleClientId) googleClientId = process.env.AUTH_GOOGLE_ID ?? undefined;
  if (!googleClientSecret) googleClientSecret = process.env.AUTH_GOOGLE_SECRET ?? undefined;
  if (!githubClientId) githubClientId = process.env.AUTH_GITHUB_ID ?? undefined;
  if (!githubClientSecret) githubClientSecret = process.env.AUTH_GITHUB_SECRET ?? undefined;

  const providers: any[] = [];

  // Only add providers that have credentials configured
  if (googleClientId && googleClientSecret) {
    providers.push(
      Google({ clientId: googleClientId, clientSecret: googleClientSecret })
    );
  }

  if (githubClientId && githubClientSecret) {
    providers.push(
      GitHub({ clientId: githubClientId, clientSecret: githubClientSecret })
    );
  }

  // Always add the passkey credentials provider
  providers.push(
    Credentials({
      id: 'passkey',
      name: 'Passkey',
      credentials: {
        userId: { label: 'User ID', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.userId) {
          return null;
        }

        const userId = credentials.userId as string;
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    })
  );

  const instance = NextAuth({
    ...authConfig,
    secret,
    adapter: PrismaAdapter(prisma),
    session: { strategy: 'jwt' },
    providers,
  });

  nextAuthInstance = instance;
  return instance;
}

/**
 * Wrapper around NextAuth's `auth()` that lazily initializes the instance
 * using database-backed configuration.
 *
 * Note: We use `any` on args because NextAuth's `auth` is an overloaded
 * function type (used in middleware, API routes, and server components).
 * This wrapper is a simple passthrough — the overload resolution happens
 * inside the actual NextAuth instance.
 */
export const auth = async (...args: any[]) => {
  const instance = await getNextAuth();
  return (instance.auth as any)(...args);
};

/**
 * Wrapper around NextAuth's `handlers` (GET/POST for [...nextauth] route).
 */
export const handlers = {
  GET: async (req: any) => {
    const instance = await getNextAuth();
    return instance.handlers.GET(req);
  },
  POST: async (req: any) => {
    const instance = await getNextAuth();
    return instance.handlers.POST(req);
  },
};

/**
 * Wrapper around NextAuth's `signIn`.
 */
export const signIn: ReturnType<typeof NextAuth>['signIn'] = async (
  ...args: any[]
) => {
  const instance = await getNextAuth();
  return (instance.signIn as any)(...args);
};

/**
 * Wrapper around NextAuth's `signOut`.
 */
export const signOut: ReturnType<typeof NextAuth>['signOut'] = async (
  ...args: any[]
) => {
  const instance = await getNextAuth();
  return (instance.signOut as any)(...args);
};
