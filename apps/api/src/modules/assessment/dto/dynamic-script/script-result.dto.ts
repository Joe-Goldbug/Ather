// apps/api/src/modules/assessment/dto/dynamic-script/script-result.dto.ts
import { IsUUID } from 'class-validator';

export class ScriptResultDto {
  @IsUUID()
  script_generation_id!: string;
}