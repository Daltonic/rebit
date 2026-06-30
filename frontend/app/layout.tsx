import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import SessionProvider from '@/components/SessionProvider';
import { auth } from '@/lib/auth/auth';

export const metadata: Metadata = {
  title: 'ReBit — Decentralized Video Clipping Engine',
  description: 'Turn long-form video into short-form vertical clips. Fully self-hosted, stored on Sia.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

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
          <Sidebar />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}