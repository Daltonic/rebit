import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * GET /api/config/backend-url
 *
 * Returns the backend URL for client-side components.
 * Reads from the database (app_settings table) with fallback to env var.
 *
 * Response: { backendUrl: string }
 */
export async function GET() {
  try {
    const backendUrl = await getBackendUrl();
    return NextResponse.json({ backendUrl });
  } catch (err) {
    console.error('Error fetching backend URL:', err);
    return NextResponse.json(
      { backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000' },
      { status: 200 }
    );
  }
}