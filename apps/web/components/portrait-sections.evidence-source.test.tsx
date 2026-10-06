/**
 * @vitest-environment jsdom
 */

/**
 * 2-A3 前端：证据条目可点开原文并高亮触发句。
 *
 * 契约：
 * 1. 证据条目可点击，点击后调用 fetchEvidenceSource(evidence.id)
 * 2. 返回 content_text + fragment → 渲染原文且触发句被 <mark> 高亮
 * 3. 无 fragment（降级）→ 弹层展示 quote 原文
 * 4. 加载失败 → 显示错误文案，不渲染错位高亮
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfilePortraitView } from './portrait-sections.js';
import type { ProfilePortraitResponse } from '@/lib/api';

const api = vi.hoisted(() => ({
  fetchEvidenceSource: vi.fn(),
  withdrawEvidence: vi.fn(),
  observationsV1Api: { respond: vi.fn(), history: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
  fetchEvidenceSource: api.fetchEvidenceSource,
  withdrawEvidence: api.withdrawEvidence,
  observationsV1Api: api.observationsV1Api,
}));

vi.mock('@/app/providers-impl', () => ({
  useLocale: () => ({
    locale: 'zh-CN',
    t: (key: string) => key,
  }),
}));

const legacyObservations: ProfilePortraitResponse = {
  modelStatus: 'legacy',
  deprecated: true,
  observations: [
    {
      id: 'obs-1',
      dimension: 'achievementMotivation',
      status: 'insufficient_evidence',
      limitation: '目前无法判断长期模式。',
      evidence: [
        {
          id: 'ev-1',
          sourceType: 'diary',
          evidenceKind: 'formal',
          quote: '晚上拖延了，没做该做的事。',
          explanation: '现实同步记录显示成就动机呈mild信号',
          createdAt: '2026-09-10T10:00:00Z',
        },
      ],
    },
  ],
  overallLimitation: '目前无法判断长期模式。',
};

describe('ProfilePortraitView 证据原文回溯（2-A3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('点击证据 → 拉取原文并高亮触发句', async () => {
    api.fetchEvidenceSource.mockResolvedValueOnce({
      evidence_id: 'ev-1',
      source_type: 'diary',
      source_id: 'd-1',
      content_text: '今天还行。晚上拖延了，没做该做的事。明天再赶。',
      fragment: { field: 'detail', start: 5, end: 18, locator: 'detail:5-18' },
    });

    render(<ProfilePortraitView data={legacyObservations} loading={false} error="" />);

    fireEvent.click(screen.getByText('晚上拖延了，没做该做的事。'));

    await waitFor(() => {
      expect(api.fetchEvidenceSource).toHaveBeenCalledWith('ev-1');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const mark = screen.getByRole('dialog').querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('晚上拖延了，没做该做的事。');
  });

  it('无 fragment → 降级展示 quote，不渲染 mark', async () => {
    api.fetchEvidenceSource.mockResolvedValueOnce({
      evidence_id: 'ev-1',
      source_type: 'diary',
      source_id: 'd-1',
      content_text: null,
      fragment: null,
    });

    render(<ProfilePortraitView data={legacyObservations} loading={false} error="" />);
    fireEvent.click(screen.getByText('晚上拖延了，没做该做的事。'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog').querySelector('mark')).toBeNull();
    expect(screen.getByText(/无法定位/)).toBeInTheDocument();
  });

  it('加载失败 → 显示错误文案', async () => {
    api.fetchEvidenceSource.mockRejectedValueOnce(new Error('HTTP 404'));

    render(<ProfilePortraitView data={legacyObservations} loading={false} error="" />);
    fireEvent.click(screen.getByText('晚上拖延了，没做该做的事。'));

    await waitFor(() => expect(screen.getByText(/HTTP 404/)).toBeInTheDocument());
    expect(screen.getByRole('dialog').querySelector('mark')).toBeNull();
  });
});

describe('ProfilePortraitView 按证据驳回（1-2b）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('弹层内点击"驳回此证据" → 调用 withdraw 并显示已重算提示', async () => {
    api.fetchEvidenceSource.mockResolvedValueOnce({
      evidence_id: 'ev-1',
      source_type: 'diary',
      source_id: 'd-1',
      content_text: '晚上拖延了，没做该做的事。',
      fragment: { field: 'detail', start: 0, end: 12, locator: 'detail:0-12' },
    });
    api.withdrawEvidence.mockResolvedValueOnce({
      evidence_id: 'ev-1',
      dimension: 'achievementMotivation',
      portrait_status: 'withdrawn',
      recomputed: { dimension: 'achievementMotivation', confidence: 0.5, value: 50 },
      already_withdrawn: false,
    });

    render(<ProfilePortraitView data={legacyObservations} loading={false} error="" />);
    fireEvent.click(screen.getByText('晚上拖延了，没做该做的事。'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '驳回此证据' }));

    await waitFor(() => expect(api.withdrawEvidence).toHaveBeenCalledWith('ev-1'));
    expect(await screen.findByText(/已驳回，画像置信度已重算/)).toBeInTheDocument();
  });
});
