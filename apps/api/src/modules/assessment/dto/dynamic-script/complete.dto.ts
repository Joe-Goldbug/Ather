// apps/api/src/modules/assessment/dto/dynamic-script/complete.dto.ts
import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CompleteDynamicDto {
  @IsUUID()
  session_id!: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}