// apps/api/src/modules/assessment/services/micro-sandbox/completeness-evaluator.ts
import { Inject, Injectable } from '@nestjs/common';
import type { Progress } from '../../dto/dynamic-script/shared/extracted-variables.dto.js';
import { COMPLETENESS_CONFIG } from '../../../assessment/dynamic-script.tokens.js';

export interface CompletenessConfig {
  minTurns: number;
  maxTurns: number;
  threshold: number;
}

@Injectable()
export class CompletenessEvaluator {
  constructor(@Inject(COMPLETENESS_CONFIG) private readonly config: CompletenessConfig) {}

  shouldTerminate(turnCount: number, progress: Progress): boolean {
    const allDimensionsCovered = Object.values(progress).every(
      (p) => p >= this.config.threshold,
    );
    if (allDimensionsCovered && turnCount >= this.config.minTurns) return true;
    if (turnCount >= this.config.maxTurns) return true;
    return false;
  }
}