import { auth } from './auth';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string };

/**
 * Server component guard: redirects to /login if no session.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  return session;
}

/**
 * API route guard: returns 401 if unauthenticated.
 */
export async function checkApiAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, message: 'Authentication required.' };
  }
  return { ok: true, userId: session.user.id };
}

/**
 * Helper to create an error response from an AuthResult.
 */
export function authErrorResponse(result: AuthResult): NextResponse {
  return NextResponse.json(
    { error: result.ok === false ? result.message : 'Unknown error' },
    { status: result.ok === false ? result.status : 500 },
  );
}