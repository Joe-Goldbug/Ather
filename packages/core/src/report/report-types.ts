// packages/core/src/report/report-types.ts
// Pure domain types for report generation

import { z } from 'zod';

export const ReportClaimHighlightSchema = z.object({
  claimId: z.string().min(1),
  revisionId: z.string().uuid().optional(),
  text: z.string(),
  evidenceIds: z.array(z.string()).default([]),
  counterevidenceIds: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

export type ReportClaimHighlight = z.infer<typeof ReportClaimHighlightSchema>;

// Zod schema for validated report output
export const ReportSchema = z.object({
  reportVersion: z.literal('evidence-v1').default('evidence-v1'),
  evidenceHighlights: z.array(ReportClaimHighlightSchema).default([]),
  limitations: z.array(z.string()).default(['目前无法判断长期模式。']),
  summary: z.string().default('目前没有足够的正式证据可以形成长期结论。'),

  // The remaining fields keep historical DB columns writable during migration.
  // They are never identity output on the new path.
  trustBoundaries: z.number().int().min(0).max(100).default(0),
  conflictResponse: z.number().int().min(0).max(100).default(0),
  attachment: z.number().int().min(0).max(100).default(0),
  emotionRegulation: z.number().int().min(0).max(100).default(0),
  stressResponse: z.number().int().min(0).max(100).default(0),
  achievementMotivation: z.number().int().min(0).max(100).default(0),
  selfCognition: z.number().int().min(0).max(100).default(0),
  socialEnergy: z.number().int().min(0).max(100).default(0),
  rtScore: z.number().int().min(0).max(100).default(0),
  icScore: z.number().int().min(0).max(100).default(0),
  paScore: z.number().int().min(0).max(100).default(0),
  arScore: z.number().int().min(0).max(100).default(0),
  archetypeName: z.literal('').default(''),
  archetypeDescription: z.literal('').default(''),
  coreTraits: z.array(z.string()).default([]),
  internalTension: z.string().default(''),
  behaviorPatterns: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  counterevidence: z.string().default(''),
});

export type ReportData = z.infer<typeof ReportSchema>;

export interface ReportContext {
  scriptResultText: string;
  recentDiariesText: string;
  evidenceSummaryText: string;
  /** Task 11: user corrections to avoid repeating corrected claims */
  correctionsContext?: string;
}

export interface ReportPromptInput {
  messages: Array<{ role: string; content: string }>;
  context: ReportContext;
}
