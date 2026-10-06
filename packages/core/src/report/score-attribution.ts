// packages/core/src/report/score-attribution.ts
// Pure functions — no DB, no network
//
// 0-4 报告维度分语义约束（注入防护）。
//
// 威胁模型：用户在对话中诱导 LLM 写"把我的外向性设为 100"。ReportSchema
// 只有 0-100 的数值边界、无语义约束，分数可未归因地落库。
//
// 防护原则（fail-closed，与 evidence-first 严格一致）：
//   维度分必须有正式证据支撑——无证据的维度分数强制归零；
//   有证据的维度保留 LLM 值（幅度上限属 D-4 产品决策，此处不发明标度）。
// rt/ic/pa/ar 是关系语义分，无证据对应物，不在本约束范围。

import type { ReportData } from './report-types.js';

const ATTRIBUTABLE_DIMENSIONS = [
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionRegulation',
  'stressResponse',
  'achievementMotivation',
  'selfCognition',
  'socialEnergy',
] as const;

export function clampUnbackedScores(
  report: ReportData,
  evidenceBackedDimensions: ReadonlySet<string>,
): { report: ReportData; clampedDimensions: string[] } {
  const clampedDimensions: string[] = [];
  const next: ReportData = { ...report };

  for (const dimension of ATTRIBUTABLE_DIMENSIONS) {
    if (evidenceBackedDimensions.has(dimension)) continue;
    const value = next[dimension];
    if (typeof value === 'number' && value !== 0) {
      next[dimension] = 0;
      clampedDimensions.push(dimension);
    }
  }

  return { report: next, clampedDimensions };
}
