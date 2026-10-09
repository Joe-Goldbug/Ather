/** @vitest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './page';
import { consentApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  authApi: { me: vi.fn().mockResolvedValue({ id: 'user-1', email: 'user@example.com' }) },
  consentApi: {
    exportData: vi.fn().mockResolvedValue({ users: [{ id: 'user-1' }] }),
    getRecordScope: vi.fn().mockResolvedValue({ scope: 'unset' }),
    setRecordScope: vi.fn().mockImplementation(async (scope: string) => ({ scope })),
  },
  evidenceApi: { getByDimension: vi.fn().mockResolvedValue([]) },
  portraitV1Api: { current: vi.fn().mockResolvedValue(null) },
  observationsV1Api: { list: vi.fn().mockResolvedValue([]) },
  themeAssessmentApi: { history: vi.fn().mockResolvedValue([]) },
}));

const mockT = (key: string) => key;

vi.mock('../providers-impl', () => ({
  useLocale: () => ({
    locale: 'zh-CN',
    t: mockT,
  }),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('@/components/portrait-sections', () => ({
  ProfilePortraitView: () => null,
  PublishedObservationResponseSection: () => null,
}));

describe('ProfilePage record scope control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(consentApi.getRecordScope).mockResolvedValue({ scope: 'unset' });
    vi.mocked(consentApi.setRecordScope).mockImplementation(async (scope: string) => ({ scope: scope as any }));
  });

  it('renders record scope card and reflects loaded unset status', async () => {
    render(<ProfilePage />);

    expect(await screen.findByText('认知记录使用权限')).toBeInTheDocument();
    expect(screen.getByText('尚未设置')).toBeInTheDocument();
    expect(screen.getByText(/💾 仅保存历史/)).toBeInTheDocument();
    expect(screen.getByText(/🧠 允许心智分析/)).toBeInTheDocument();
    expect(screen.getByText(/🌐 允许授权分享/)).toBeInTheDocument();
  });

  it('switches to store_only and calls setRecordScope', async () => {
    vi.mocked(consentApi.getRecordScope).mockResolvedValue({ scope: 'analyze_permitted' });
    render(<ProfilePage />);

    expect(await screen.findByText('认知记录使用权限')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('允许心智分析')).toBeInTheDocument();
    });

    const storeOnlyRadio = screen.getByRole('radio', { name: /仅保存历史/ });
    fireEvent.click(storeOnlyRadio);

    await waitFor(() => {
      expect(consentApi.setRecordScope).toHaveBeenCalledWith('store_only');
      expect(screen.getByText('仅本地保存')).toBeInTheDocument();
      expect(screen.getByText('权限范围设置已更新并生效')).toBeInTheDocument();
    });
  });

  it('shows error if setRecordScope fails', async () => {
    vi.mocked(consentApi.setRecordScope).mockRejectedValueOnce(new Error('网络超时或数据库事务中断'));
    render(<ProfilePage />);

    expect(await screen.findByText('认知记录使用权限')).toBeInTheDocument();
    expect(screen.getByText('尚未设置')).toBeInTheDocument();

    const analyzeRadio = screen.getByRole('radio', { name: /允许心智分析/ });
    fireEvent.click(analyzeRadio);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('网络超时或数据库事务中断');
      expect(screen.getByText('尚未设置')).toBeInTheDocument();
    });
  });
});
