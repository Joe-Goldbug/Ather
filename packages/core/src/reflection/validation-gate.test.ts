import { describe, expect, test } from 'bun:test';
import {
  validateLLMExplanation,
  type ValidationGateResult,
  type ValidationGateInput,
} from './validation-gate.js';

function makeValidExplanation() {
  return {
    headline: '你对信任有了新的理解',
    summary: '这次回答让 EVA 对你的当前画像做了一次轻量更新。',
    changed_dimensions: [
      {
        dimension: 'trustBoundaries',
        change_label: '更倾向于观察',
        explanation: '比起上次，这次的选择更注重先观察再信任。',
        confidence_phrase: '这个趋势还需要更多数据来验证。',
      },
    ],
    stable_dimensions: [
      {
        dimension: 'attachment',
        explanation: '依恋模式保持稳定。',
      },
    ],
    uncertainty_notes: [
      {
        dimension: 'conflictResponse',
        note: '目前对冲突反应的数据还不够，无法判断。',
      },
    ],
    next_step: {
      action_type: 'next_test' as const,
      label: '继续下一组题',
      reason: '继续收集更多维度的证据',
    },
  };
}

function makeGateInput(
  overrides: Partial<ValidationGateInput> = {},
): ValidationGateInput {
  return {
    allowed_dimensions: [
      'trustBoundaries',
      'conflictResponse',
      'attachment',
      'emotionRegulation',
      'stressResponse',
      'achievementMotivation',
      'selfCognition',
      'socialEnergy',
    ],
    user_tier: 'registered_free',
    allowed_archetype_id: 'boundary_guard',
    confidence_by_dim: {
      trustBoundaries: 0.35,
      conflictResponse: 0.6,
      attachment: 0.7,
      emotionRegulation: 0.5,
      stressResponse: 0.4,
      achievementMotivation: 0.6,
      selfCognition: 0.55,
      socialEnergy: 0.65,
    },
    ...overrides,
  };
}

// P0-1: 正常解释通过校验
describe('ValidationGate — 正常输出', () => {
  test('valid explanation passes all checks', () => {
    const input = makeGateInput();
    const explanation = makeValidExplanation();
    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// P0-2: LLM 不能新增不存在的维度
describe('ValidationGate — unknown_dimension', () => {
  test('rejects explanation mentioning dimension not in allowed list', () => {
    const input = makeGateInput({
      allowed_dimensions: ['trustBoundaries', 'attachment'],
    });
    const explanation = makeValidExplanation();
    explanation.changed_dimensions.push({
      dimension: 'conflictResponse',
      change_label: '变了',
      explanation: '冲突回应有变化',
      confidence_phrase: '确定',
    });
    explanation.stable_dimensions.push({
      dimension: 'socialEnergy',
      explanation: '社交能量稳定',
    });

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    const dimErrors = result.errors.filter(
      (e) => e.code === 'unknown_dimension',
    );
    expect(dimErrors.length).toBeGreaterThan(0);
    expect(dimErrors[0]!.message).toContain('conflictResponse');
  });
});

// P0-3: 低置信维度不能输出"确定"
describe('ValidationGate — overconfident_claim', () => {
  test('rejects overconfident language on low-confidence dimension', () => {
    const input = makeGateInput({
      confidence_by_dim: {
        trustBoundaries: 0.3,
        conflictResponse: 0.6,
        attachment: 0.7,
        emotionRegulation: 0.5,
        stressResponse: 0.4,
        achievementMotivation: 0.6,
        selfCognition: 0.55,
        socialEnergy: 0.65,
      },
    });
    const explanation = makeValidExplanation();
    explanation.changed_dimensions[0]!.confidence_phrase =
      '这个结论非常确定，你可以相信';

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'overconfident_claim'),
    ).toBe(true);
  });
});

// P0-4: 免费用户不能获得 paid_calibration next_step
describe('ValidationGate — unauthorized_next_action', () => {
  test('rejects paid_calibration for free user', () => {
    const input = makeGateInput({ user_tier: 'registered_free' });
    const explanation = makeValidExplanation();
    explanation.next_step = {
      action_type: 'paid_calibration',
      label: '深度校准',
      reason: '需要付费校准',
    };

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'unauthorized_next_action'),
    ).toBe(true);
  });

  test('rejects diary_prompt for free user', () => {
    const input = makeGateInput({ user_tier: 'registered_free' });
    const explanation = makeValidExplanation();
    explanation.next_step = {
      action_type: 'diary_prompt',
      label: '写日记',
      reason: '记录你今天的事',
    };

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'unauthorized_next_action'),
    ).toBe(true);
  });
});

// P0-5: 诊断式语言禁止
describe('ValidationGate — diagnostic_language', () => {
  test('rejects diagnostic labels in headline', () => {
    const input = makeGateInput();
    const explanation = makeValidExplanation();
    explanation.headline = '你有回避型人格障碍的倾向';

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'diagnostic_language'),
    ).toBe(true);
  });

  test('rejects "你是..." pattern in summary', () => {
    const input = makeGateInput();
    const explanation = makeValidExplanation();
    explanation.summary = '你是一个高敏感人格，属于焦虑型依恋类型';

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'diagnostic_language'),
    ).toBe(true);
  });
});

// P0-6: 编造事实禁止
describe('ValidationGate — invented_fact', () => {
  test('rejects fabricated events in explanation', () => {
    const input = makeGateInput();
    const explanation = makeValidExplanation();
    explanation.changed_dimensions[0]!.explanation =
      '你上次和同事吵架之后，开始重新审视自己的人际边界';

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'invented_fact'),
    ).toBe(true);
  });
});

// P0-7: 付费用户可以使用 paid_calibration
describe('ValidationGate — paid user allowed actions', () => {
  test('allows paid_calibration for paid user', () => {
    const input = makeGateInput({ user_tier: 'paid' });
    const explanation = makeValidExplanation();
    explanation.next_step = {
      action_type: 'paid_calibration',
      label: '深度校准',
      reason: '需要付费校准',
    };

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(true);
  });
});

// P0-8: 空输出被拒绝
describe('ValidationGate — empty output', () => {
  test('rejects explanation with empty headline', () => {
    const input = makeGateInput();
    const explanation = makeValidExplanation();
    explanation.headline = '';

    const result = validateLLMExplanation(explanation, input);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'schema_invalid'),
    ).toBe(true);
  });
});
