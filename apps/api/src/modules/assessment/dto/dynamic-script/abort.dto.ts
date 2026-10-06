// apps/api/src/modules/assessment/dto/dynamic-script/abort.dto.ts
import { IsUUID, IsOptional, IsIn } from 'class-validator';

export class AbortDynamicDto {
  @IsUUID()
  session_id!: string;

  @IsOptional()
  @IsIn(['user_cancelled', 'changed_mind', 'other'])
  reason?: 'user_cancelled' | 'changed_mind' | 'other';
}