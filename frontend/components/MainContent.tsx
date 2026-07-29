'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { useSidebar } from './SidebarContext';

export default function MainContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isPublicPage = pathname === '/' || pathname === '/login' || pathname === '/setup' || pathname === '/unauthorized' || pathname === '/whitepaper';

  return (
    <main
      className={`pt-14 min-h-screen transition-[margin] duration-200 ${
        isPublicPage ? '' : collapsed ? 'md:ml-[60px]' : 'md:ml-[220px]'
      }`}
    >
      {children}
    </main>
  );
}
