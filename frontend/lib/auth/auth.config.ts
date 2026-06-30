import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma/client';

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnPublicPage =
        nextUrl.pathname === '/' ||
        nextUrl.pathname === '/login' ||
        nextUrl.pathname.startsWith('/api/auth') ||
        nextUrl.pathname === '/unauthorized';

      if (isOnPublicPage) {
        return true;
      }

      if (isLoggedIn) {
        return true;
      }

      return false;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.picture = user.image;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        if (token.picture) session.user.image = token.picture;
        if (token.name) session.user.name = token.name;
        if (token.email) session.user.email = token.email;
      }
      return session;
    },
  },
  providers: [
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
    }),
  ],
};