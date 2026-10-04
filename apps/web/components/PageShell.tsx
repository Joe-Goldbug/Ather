'use client';

import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface PageShellProps {
  children: ReactNode;
}

/** 页面外壳：顶栏 + 内容。由 providers-impl.tsx 挂载，全站生效。 */
export function PageShell({ children }: PageShellProps) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
