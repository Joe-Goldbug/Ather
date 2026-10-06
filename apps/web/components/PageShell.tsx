'use client';

import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}