import type { Metadata, Viewport } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import TopNav from '@/components/TopNav';
import SessionProvider from '@/components/SessionProvider';
import { SidebarProvider } from '@/components/SidebarContext';
import MainContent from '@/components/MainContent';
import { auth } from '@/lib/auth/auth';

export const metadata: Metadata = {
  title: 'ReBit — Decentralized Video Clipping Engine',
  description: 'Turn long-form video into short-form vertical clips. Fully self-hosted, stored on Sia.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Gracefully handle auth errors — during initial setup the auth secret
  // may not exist in the database yet, so auth() would throw.
  let session = null;
  try {
    session = await auth();
  } catch {
    // Auth not configured yet (e.g. during setup) — pass null session
  }

  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionProvider session={session}>
          <SidebarProvider>
            <Sidebar />
            <TopNav />
            <MainContent>{children}</MainContent>
          </SidebarProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
