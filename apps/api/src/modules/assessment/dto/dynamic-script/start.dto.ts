// apps/api/src/modules/assessment/dto/dynamic-script/start.dto.ts
import { IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

export class StartDynamicDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  initial_input!: string;

  @IsOptional()
  @IsIn(['zh-CN', 'en', 'ja', 'es'])
  locale?: string;

  @IsOptional()
  @IsIn(['dynamic', 'auto'])
  mode?: 'dynamic' | 'auto';
}