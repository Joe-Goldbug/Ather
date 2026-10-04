import type { AuthUser } from '@/lib/api';

export type AssessmentEntryPath = '/theme-assessment';

export function resolveAssessmentEntryPath(user?: AuthUser | null): AssessmentEntryPath {
  void user;
  return '/theme-assessment';
}
