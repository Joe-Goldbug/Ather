// packages/core/src/safety/index.ts
// Safety & compliance layer — placeholder for consent/audit/safety mechanisms
// To be fully implemented in Phase 4 (NestJS) and Phase 6 (Next.js)

// Content safety — placeholder for future content moderation
export interface ContentSafetyResult {
  passed: boolean;
  reason?: string;
}

// Consent grant — placeholder
export interface ConsentGrant {
  userId: string;
  scope: string;
  grantedAt: number;
  expiresAt?: number;
}

// Audit log entry — placeholder
export interface AuditEntry {
  userId: string;
  action: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Default content safety check — passes everything.
 * Replace with actual moderation in NestJS (Phase 4).
 */
export function checkContentSafety(message: string): ContentSafetyResult {
  // No-op: all content passes until moderation is implemented
  return { passed: true };
}