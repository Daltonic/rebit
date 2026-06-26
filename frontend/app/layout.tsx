import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'ReBit — Decentralized Video Clipping Engine',
  description: 'Turn long-form video into short-form vertical clips. Fully self-hosted, stored on Sia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NavBar />
        <main style={{ paddingTop: '56px' }}>{children}</main>
      </body>
    </html>
  );
}
