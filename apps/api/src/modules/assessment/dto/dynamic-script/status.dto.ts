// apps/api/src/modules/assessment/dto/dynamic-script/status.dto.ts
import { IsUUID } from 'class-validator';

export class StatusDynamicDto {
  @IsUUID()
  session_id!: string;
}