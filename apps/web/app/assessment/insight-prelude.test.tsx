/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { InsightPrelude, buildInsightPrelude } from './insight-prelude';
import type { PersonalityVector, ScriptEvidence } from '@eva/core/shared';

function makeVector(overrides: Partial<PersonalityVector> = {}): PersonalityVector {
  return {
    trust_threshold: 0.5,
    boundary_strength: 0.5,
    conflict_style: 'analytical',
    conflict_score: 0.5,
    attachment_pattern: 'secure',
    attachment_score: 0.5,
    emotional_regulation: 'rational',
    stress_response: 'activation',
    stress_score: 0.5,
    achievement_drive: 'flow_state',
    perfectionism_score: 0.5,
    selfview_pattern: 'growth_minded',
    growth_mindset_score: 0.5,
    social_energy_style: 'selective',
    social_energy_score: 0.5,
    openness_score: 0.5,
    stability_score: 0.5,
    neuroticism_score: 0.5,
    confidence: {} as Record<string, number>,
    ...overrides,
  };
}

function makeEvidence(): ScriptEvidence[] {
  return [
    {
      id: 'ev-1',
      scenarioId: 'trust',
      dimensionId: 'trustBoundaries',
      choice: 'A',
      choiceLabel: '先靠近',
      choiceText: '马上认真接住，继续问细节，也让对方知道你愿意听。',
      scenarioTitle: '先接住，还是先留边界',
      context: '',
      expectedSignal: 'low',
      vectorPatch: {},
    },
    {
      id: 'ev-2',
      scenarioId: 'conflict',
      dimensionId: 'conflictResponse',
      choice: 'B',
      choiceLabel: '先听再拆',
      choiceText: '先让对方把理由说完，再逐点回应。',
      scenarioTitle: '被当众否定方案',
      context: '',
      expectedSignal: 'high',
      vectorPatch: {},
    },
    {
      id: 'ev-3',
      scenarioId: 'attachment',
      dimensionId: 'attachment',
      choice: 'C',
      choiceLabel: '先怪自己',
      choiceText: '开始反复想是不是自己哪里做错了，会想办法补救。',
      scenarioTitle: '重要的人突然冷下来',
      context: '',
      expectedSignal: 'mid-low',
      vectorPatch: {},
    },
  ];
}

describe('Continuous observation result', () => {
  it('describes the person directly, including a strength and a likely cost', () => {
    const result = buildInsightPrelude(makeVector(), makeEvidence());

    expect(result).not.toBeNull();
    expect(result!.title).toContain('愿意靠近');
    expect(result!.summary).toMatch(/主动接住|认真听|关系/);
    expect(result!.insights).toHaveLength(3);
    expect(result!.insights.map((item) => item.interpretation).join('\n')).toMatch(/冲突|否定/);
    expect(result!.strength).toMatch(/可靠|沟通|修复|接住/);
    expect(result!.watchout).toMatch(/自责|责任|自己/);
    expect(result!.boundary).toContain('这轮');
  });

  it('links every interpretation to a concrete choice the user made', () => {
    const result = buildInsightPrelude(makeVector(), makeEvidence());

    expect(result).not.toBeNull();
    expect(result!.insights.every((item) => item.evidence.startsWith('你的选择：'))).toBe(true);
    expect(result!.insights.map((item) => item.evidence).join('\n')).toContain('先让对方把理由说完');
    expect(result!.insights.map((item) => item.evidence).join('\n')).toContain('开始反复想是不是自己哪里做错');
  });

  it('says that it cannot interpret when no usable evidence is available', () => {
    const result = buildInsightPrelude(makeVector(), []);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('没有足够的具体选择');
    expect(result!.insights).toEqual([]);
  });

  it('renders a behavioral portrait with strengths and costs', () => {
    render(<InsightPrelude vector={makeVector()} evidenceLog={makeEvidence()} />);

    expect(screen.getByRole('heading', { name: /愿意靠近/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: '你带来的优势' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '你可能付出的代价' })).toBeDefined();
    expect(screen.getByText(/不是对你的永久定义/)).toBeDefined();
    expect(screen.queryByText(/目前无法判断长期模式/)).toBeNull();
  });
});
