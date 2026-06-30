'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextValue {
  /** Off-canvas drawer open state, used on mobile/tablet (<md) */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Rail collapsed state, used on desktop (md+) */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarContext.Provider value={{ mobileOpen, setMobileOpen, collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}
