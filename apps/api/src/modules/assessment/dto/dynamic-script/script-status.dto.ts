// apps/api/src/modules/assessment/dto/dynamic-script/script-status.dto.ts
import { IsUUID } from 'class-validator';

export class ScriptStatusDto {
  @IsUUID()
  script_generation_id!: string;
}

export const GENERATION_STATUSES = ['pending', 'generating', 'validating', 'revising', 'saving', 'ready', 'failed'] as const;
export type GenerationStatus = typeof GENERATION_STATUSES[number];
