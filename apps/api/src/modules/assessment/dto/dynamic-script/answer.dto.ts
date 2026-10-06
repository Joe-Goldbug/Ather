// apps/api/src/modules/assessment/dto/dynamic-script/answer.dto.ts
import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

export class AnswerDynamicDto {
  @IsUUID()
  session_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer!: string;
}