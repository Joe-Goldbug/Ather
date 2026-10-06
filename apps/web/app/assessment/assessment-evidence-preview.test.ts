import { describe, expect, it } from 'vitest';
import { buildAssessmentEvidencePreview, buildAssessmentResultHeader } from './assessment-evidence-preview';
import type { ScriptEvidence } from '@eva/core/shared';

function makeEvidence(): ScriptEvidence[] {
  return [
    {
      id: 'evidence-1',
      scenarioId: 'scenario-1',
      dimensionId: 'trust',
      choice: 'A',
      choiceLabel: 'A',
      choiceText: '先问清楚发生了什么',
      scenarioTitle: '被当众否定方案',
      context: '',
      expectedSignal: 'mid-high',
      vectorPatch: {},
    },
  ];
}

describe('buildAssessmentEvidencePreview', () => {
  it('returns the concrete choices and one short scope note', () => {
    const preview = buildAssessmentEvidencePreview(makeEvidence());

    expect(preview.title).toBe('为什么会得到这个判断');
    expect(preview.facts).toEqual([
      { scenario: '被当众否定方案', choice: '先问清楚发生了什么' },
    ]);
    expect(preview.boundary).toBe('这是你在本轮情境中的行为倾向，不是对你的永久定义。');
  });

  it('uses a clear unavailable message when evidence is absent', () => {
    const preview = buildAssessmentEvidencePreview([]);

    expect(preview.facts).toEqual([]);
    expect(preview.boundary).toContain('没有足够的选择');
  });
});

describe('buildAssessmentResultHeader', () => {
  it('returns default title when no evidence log is provided', () => {
    expect(buildAssessmentResultHeader()).toEqual({
      title: '综合性格与行为画像',
      description: '从你刚才的选择里，看看你如何靠近别人、应对冲突，也如何保护自己。',
    });
  });

  it('returns emotional & relationship portrait when attachment/emotion/trust dominate', () => {
    const evidence: ScriptEvidence[] = [
      { id: '1', scenarioId: 's1', dimensionId: 'attachment', choice: 'A', choiceLabel: 'A', choiceText: '', scenarioTitle: '', context: '', expectedSignal: 'low', vectorPatch: {} },
      { id: '2', scenarioId: 's2', dimensionId: 'emotion', choice: 'A', choiceLabel: 'A', choiceText: '', scenarioTitle: '', context: '', expectedSignal: 'low', vectorPatch: {} },
    ];
    expect(buildAssessmentResultHeader(evidence).title).toBe('情感与关系模式画像');
  });

  it('returns stress & boundary portrait when stress/conflict/boundary dominate', () => {
    const evidence: ScriptEvidence[] = [
      { id: '1', scenarioId: 's1', dimensionId: 'stress', choice: 'A', choiceLabel: 'A', choiceText: '', scenarioTitle: '', context: '', expectedSignal: 'low', vectorPatch: {} },
      { id: '2', scenarioId: 's2', dimensionId: 'conflict', choice: 'A', choiceLabel: 'A', choiceText: '', scenarioTitle: '', context: '', expectedSignal: 'low', vectorPatch: {} },
    ];
    expect(buildAssessmentResultHeader(evidence).title).toBe('应激与防线画像');
  });

  it('returns core personality portrait when growth/achievement/self dominate', () => {
    const evidence: ScriptEvidence[] = [
      { id: '1', scenarioId: 's1', dimensionId: 'growth', choice: 'A', choiceLabel: 'A', choiceText: '', scenarioTitle: '', context: '', expectedSignal: 'low', vectorPatch: {} },
      { id: '2', scenarioId: 's2', dimensionId: 'achievement', choice: 'A', choiceLabel: 'A', choiceText: '', scenarioTitle: '', context: '', expectedSignal: 'low', vectorPatch: {} },
    ];
    expect(buildAssessmentResultHeader(evidence).title).toBe('核心人格特质画像');
  });
});
