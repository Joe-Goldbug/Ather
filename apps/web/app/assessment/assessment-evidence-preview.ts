import type { ScriptEvidence } from '@eva/core/shared';

export interface AssessmentEvidencePreview {
  title: string;
  facts: Array<{ scenario: string; choice: string }>;
  boundary: string;
}

export function buildAssessmentResultHeader(evidenceLog?: ScriptEvidence[]) {
  if (!evidenceLog || evidenceLog.length === 0) {
    return {
      title: '综合性格与行为画像',
      description: '从你刚才的选择里，看看你如何靠近别人、应对冲突，也如何保护自己。',
    };
  }

  // Count dimension occurrences in the current assessment round
  const dimCounts: Record<string, number> = {};
  for (const item of evidenceLog) {
    const dim = item.dimensionId ?? '';
    dimCounts[dim] = (dimCounts[dim] ?? 0) + 1;
  }

  const emotionalScore = (dimCounts['attachment'] ?? 0) + (dimCounts['emotion'] ?? 0) + (dimCounts['trust'] ?? 0);
  const stressScore = (dimCounts['stress'] ?? 0) + (dimCounts['conflict'] ?? 0) + (dimCounts['boundary'] ?? 0);
  const personalityScore = (dimCounts['growth'] ?? 0) + (dimCounts['achievement'] ?? 0) + (dimCounts['self'] ?? 0);

  if (emotionalScore > stressScore && emotionalScore >= personalityScore) {
    return {
      title: '情感与关系模式画像',
      description: '基于你在情感关系与社交互动中的选择，看清你如何建立信任、回应依赖与守护情绪。',
    };
  }

  if (stressScore > emotionalScore && stressScore >= personalityScore) {
    return {
      title: '应激与防线画像',
      description: '基于你在冲突碰撞与压力场景下的选择，看清你如何设立边界、化解分歧与保护自己。',
    };
  }

  if (personalityScore > emotionalScore && personalityScore > stressScore) {
    return {
      title: '核心人格特质画像',
      description: '基于你在成就动力与自我认知方面的选择，看清你的核心行为惯性与内在成长路径。',
    };
  }

  return {
    title: '综合性格与行为画像',
    description: '从你刚才的选择里，看看你如何靠近别人、应对冲突，也如何保护自己。',
  };
}

/**
 * The assessment result is an evidence handoff, not a personality scorecard.
 * It deliberately exposes only the choices the user can recognise and correct.
 */
export function buildAssessmentEvidencePreview(
  evidenceLog: ScriptEvidence[],
): AssessmentEvidencePreview {
  const facts = evidenceLog
    .filter((item) => item.scenarioTitle && item.choiceText)
    .slice(0, 3)
    .map((item) => ({
      scenario: item.scenarioTitle,
      choice: item.choiceText,
    }));

  return {
    title: '为什么会得到这个判断',
    facts,
    boundary: facts.length > 0
      ? '这是你在本轮情境中的行为倾向，不是对你的永久定义。'
      : '这轮没有足够的选择可以解释。',
  };
}
