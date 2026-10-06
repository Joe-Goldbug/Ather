// apps/web/components/portrait-sections.test.tsx
// V1.1 dimension-specific confidence copy tests (per 2026-06-26 spec section 9)

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ConfidenceDimensionCard,
  ProfilePortraitView,
  PublishedObservationResponseSection,
  RadarChart,
  ResultPortraitPreview,
  UBVSummaryPanel,
} from './portrait-sections';
import { messages } from '../messages/index';

const { respondToObservation } = vi.hoisted(() => ({ respondToObservation: vi.fn() }));

vi.mock('@/lib/api', () => ({
  observationsV1Api: { respond: respondToObservation },
}));

vi.mock('@/app/providers-impl', () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function makeT(locale: 'zh-CN' = 'zh-CN'): TFunction {
  const msgs = messages[locale] as unknown as Record<string, unknown>;
  return (key, vars) => {
    const parts = key.split('.');
    let cur: unknown = msgs;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return key;
      }
    }
    if (typeof cur !== 'string') return key;
    if (!vars) return cur;
    return cur.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

describe('ConfidenceDimensionCard V1.1', () => {
  it('renders dimension-specific confidence explanations instead of repeated state templates', () => {
    const t = makeT('zh-CN');

    const { container } = render(
      <div>
        <ConfidenceDimensionCard
          dimension="attachment"
          state="relatively_stable"
          limitingFactor="sufficiency"
          t={t}
        />
        <ConfidenceDimensionCard
          dimension="stressResponse"
          state="relatively_stable"
          limitingFactor="sufficiency"
          t={t}
        />
        <ConfidenceDimensionCard
          dimension="socialEnergy"
          state="relatively_stable"
          limitingFactor="sufficiency"
          t={t}
        />
      </div>
    );

    const fullText = container.textContent ?? '';

    // 维度专属关键词断言
    expect(fullText).toMatch(/关系/);
    expect(fullText).toMatch(/压力/);
    expect(fullText).toMatch(/社交|能量/);

    // 三个 reading 必须互不相同
    const readingParagraphs = Array.from(container.querySelectorAll('p')).slice(0, 3);
    const readings = readingParagraphs.map((p) => p.textContent?.trim() ?? '');
    const uniqueReadings = new Set(readings);
    expect(uniqueReadings.size).toBe(3);
  });

  it('does not expose raw factor labels before disclosure expansion', () => {
    const t = makeT('zh-CN');

    render(
      <ConfidenceDimensionCard
        dimension="attachment"
        state="relatively_stable"
        limitingFactor="sufficiency"
        t={t}
      />
    );

    expect(screen.queryByText('证据充分度')).not.toBeInTheDocument();
    expect(screen.queryByText('来源覆盖')).not.toBeInTheDocument();
    expect(screen.queryByText('一致性')).not.toBeInTheDocument();
    expect(screen.queryByText('校准度')).not.toBeInTheDocument();
    expect(screen.queryByText('卡点')).not.toBeInTheDocument();
  });

  it('header uses combined "dimension · state" format with state badge', () => {
    const t = makeT('zh-CN');

    const { container } = render(
      <ConfidenceDimensionCard
        dimension="attachment"
        state="relatively_stable"
        limitingFactor="sufficiency"
        t={t}
      />
    );

    // 维度名 + 中点 + 状态徽章 同时存在于 header 行
    expect(container.textContent).toContain('依恋');
    expect(container.textContent).toContain('·');
    expect(container.textContent).toContain('比较稳定');
  });
});

describe('RadarChart Minimalist', () => {
  const mockData = [
    { dimension: 'trustBoundaries', value: 0.63, confidence: 0.8 },
    { dimension: 'conflictResponse', value: 0.75, confidence: 0.7 },
    { dimension: 'attachment', value: 0.88, confidence: 0.9 },
    { dimension: 'emotionRegulation', value: 0.52, confidence: 0.6 },
    { dimension: 'stressResponse', value: 0.70, confidence: 0.75 },
    { dimension: 'achievementMotivation', value: 0.45, confidence: 0.55 },
    { dimension: 'selfCognition', value: 0.82, confidence: 0.85 },
    { dimension: 'socialEnergy', value: 0.38, confidence: 0.5 },
  ];

  const t = (key: string) => key;

  it('renders with radar-container class', () => {
    const { container } = render(
      <RadarChart data={mockData} label="test" t={t} />
    );
    expect(container.querySelector('.radar-container')).toBeTruthy();
  });

  it('has exactly 8 dot nodes', () => {
    const { container } = render(
      <RadarChart data={mockData} label="test" t={t} />
    );
    const dots = container.querySelectorAll('circle');
    expect(dots.length).toBe(8);
  });

  it('has confidence polygon with dashed stroke', () => {
    const { container } = render(
      <RadarChart data={mockData} label="test" t={t} />
    );
    const svg = container.querySelector('svg');
    const dashedPolys = Array.from(svg!.querySelectorAll('polygon')).filter(p =>
      p.getAttribute('stroke-dasharray') !== null
    );
    expect(dashedPolys.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Confidence Classes Minimalist', () => {
  const t = (key: string) => key;

  it('ConfidenceDimensionCard uses confidence-card-minimal class', () => {
    const { container } = render(
      <ConfidenceDimensionCard
        dimension="attachment"
        state="relatively_stable"
        limitingFactor="sufficiency"
        t={t}
      />
    );
    expect(container.querySelector('.confidence-card-minimal')).toBeTruthy();
  });
});

describe('ResultPortraitPreview', () => {
  it('shows the choices that support this result instead of UBV or a radar chart', () => {
    const { container } = render(
      <ResultPortraitPreview
        result={{
          evidence_log: [
            {
              id: 'evidence-1',
              scenarioId: 'public-rejection',
              dimensionId: 'conflict_response',
              choice: 'ask-clarifying-question',
              choiceLabel: '问清楚',
              choiceText: '先问清楚哪里没有对上',
              scenarioTitle: '被当众否定方案',
              context: 'work',
              expectedSignal: 'mid-high',
              vectorPatch: {},
            },
          ],
        } as never}
      />,
    );

    expect(screen.getByRole('heading', { name: '为什么会得到这个判断' })).toBeInTheDocument();
    expect(container.textContent).toContain('被当众否定方案');
    expect(container.textContent).toContain('先问清楚哪里没有对上');
    expect(container.textContent).not.toContain('永久定义');
    expect(container.textContent).not.toContain('目前无法判断长期模式');
    expect(container.textContent).not.toContain('UBV');
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('ProfilePortraitView', () => {
  it('renders inspectable evidence and an explicit limit instead of a score chart', () => {
    const { container } = render(
      <ProfilePortraitView
        loading={false}
        error=""
        data={{
          modelStatus: 'legacy',
          deprecated: true,
          overallLimitation: '目前无法判断长期模式。',
          observations: [{
            id: 'observation:trustBoundaries:evidence-1',
            dimension: 'trustBoundaries',
            status: 'insufficient_evidence',
            limitation: '目前无法判断长期模式。',
            evidence: [{
              id: 'evidence-1',
              sourceType: 'baseline',
              evidenceKind: 'formal',
              quote: '我会先问清楚哪里没有对上。',
              explanation: '来自一次情境选择。',
              createdAt: '2026-07-29T00:00:00.000Z',
            }],
          }],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: '目前收集到的线索' })).toBeInTheDocument();
    expect(container.textContent).toContain('我会先问清楚哪里没有对上');
    expect(container.textContent).toContain('目前无法判断长期模式');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toMatch(/%|UBV|雷达图/);
  });
});

describe('PublishedObservationResponseSection', () => {
  it('reuses the operation ID when retrying an uncertain response', async () => {
    respondToObservation.mockReset();
    respondToObservation.mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ state: 'pending_validation' });
    render(<PublishedObservationResponseSection observations={[{
      observation_id: 'observation-1', revision_id: 'revision-1', text: '原观察',
      published_at: null, feedback_state: 'uncontested',
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: '回应这条观察' }));
    fireEvent.click(screen.getByRole('button', { name: '不符合' }));
    fireEvent.change(screen.getByPlaceholderText('请说明是什么情境、哪里不符合，或缺少了什么。'), {
      target: { value: '在熟悉团队里不符合。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交回应' }));
    await screen.findByText(/保存结果未确认。本页相同内容可安全重试/);
    fireEvent.click(screen.getByRole('button', { name: '提交回应' }));
    await waitFor(() => expect(respondToObservation).toHaveBeenCalledTimes(2));
    expect(respondToObservation.mock.calls[0][2].operation_id)
      .toBe(respondToObservation.mock.calls[1][2].operation_id);
  });

  it('uses a new operation ID if the user changes the response after an uncertain result', async () => {
    respondToObservation.mockReset();
    respondToObservation.mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ state: 'pending_validation' });
    render(<PublishedObservationResponseSection observations={[{
      observation_id: 'observation-1', revision_id: 'revision-1', text: '原观察',
      published_at: null, feedback_state: 'uncontested',
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: '回应这条观察' }));
    fireEvent.click(screen.getByRole('button', { name: '不符合' }));
    const input = screen.getByPlaceholderText('请说明是什么情境、哪里不符合，或缺少了什么。');
    fireEvent.change(input, { target: { value: '初稿' } });
    fireEvent.click(screen.getByRole('button', { name: '提交回应' }));
    await screen.findByText(/保存结果未确认/);
    fireEvent.change(input, { target: { value: '修订稿' } });
    fireEvent.click(screen.getByRole('button', { name: '提交回应' }));
    await waitFor(() => expect(respondToObservation).toHaveBeenCalledTimes(2));
    expect(respondToObservation.mock.calls[0][2].operation_id)
      .not.toBe(respondToObservation.mock.calls[1][2].operation_id);
  });

  it('binds a user refutation to the exact published observation revision', async () => {
    respondToObservation.mockResolvedValue({ state: 'pending_validation' });
    render(
      <PublishedObservationResponseSection
        observations={[{
          observation_id: 'observation-1',
          revision_id: 'revision-1',
          text: '你在工作冲突中先要求澄清。',
          published_at: '2026-07-29T00:00:00.000Z',
          feedback_state: 'uncontested',
        }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '回应这条观察' }));
    fireEvent.click(screen.getByRole('button', { name: '不符合' }));
    fireEvent.change(screen.getByPlaceholderText('请说明是什么情境、哪里不符合，或缺少了什么。'), {
      target: { value: '我在熟悉的团队里会直接说出不同意见。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交回应' }));

    await waitFor(() => {
      expect(respondToObservation).toHaveBeenCalledWith(
        'observation-1',
        'revision-1',
        expect.objectContaining({
          action: 'refute',
          explanation: '我在熟悉的团队里会直接说出不同意见。',
          operation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      );
    });
    expect(await screen.findByText(/你已回应这条观察/)).toBeInTheDocument();
  });

  it('shows persisted disputed status before the historical observation text', () => {
    const { container } = render(<PublishedObservationResponseSection observations={[{
      observation_id: 'observation-1', revision_id: 'revision-1', text: '原观察',
      published_at: null, feedback_state: 'needs_follow_up',
    }]} />);

    const item = container.querySelector('.evidence-node');
    expect(item?.textContent).toMatch(/^你已回应这条观察.*原观察/);
  });

  it('clears the disputed label after the user confirms the same revision', async () => {
    respondToObservation.mockResolvedValue({ state: 'confirmed' });
    render(<PublishedObservationResponseSection observations={[{
      observation_id: 'observation-1', revision_id: 'revision-1', text: '原观察',
      published_at: null, feedback_state: 'needs_follow_up',
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: '回应这条观察' }));
    fireEvent.click(screen.getByRole('button', { name: '符合' }));
    await waitFor(() => expect(screen.queryByText(/你已回应这条观察/)).toBeNull());
  });

  it('explains why there is no correction control when no formal observation exists', () => {
    render(<PublishedObservationResponseSection observations={[]} />);

    expect(screen.getByText(/目前没有已发布的正式观察/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '回应这条观察' })).toBeNull();
  });
});
