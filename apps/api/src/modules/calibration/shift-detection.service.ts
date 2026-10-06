// apps/api/src/modules/calibration/shift-detection.service.ts
// [S1-active] Shift detection service — wraps core detectShift five-gate with DB context.
// Gathers necessary data (parallel items, confidence, evidence count, correction days, RCI)
// and delegates to the pure five-gate function.

import { Injectable } from '@nestjs/common';
import type { ShiftDetectionResult } from '@eva/core';

@Injectable()
export class ShiftDetectionService {
  /**
   * Compatibility guard for callers that have not migrated. The old five-gate
   * implementation read UBV confidence and used a placeholder RCI, so it
   * cannot produce a user-visible change claim under the v1 contract.
   */
  async checkForShift(userId: string, dimension: string): Promise<ShiftDetectionResult> {
    void userId;
    return {
      shifted: false,
      dimension,
      message: '目前没有已批准的规则可以判断变化。',
      gates: {
        parallelItem: false,
        confidence: false,
        recentEvidence: false,
        noCorrectionRecent: false,
        rciSignificant: false,
      },
    };
  }
}
