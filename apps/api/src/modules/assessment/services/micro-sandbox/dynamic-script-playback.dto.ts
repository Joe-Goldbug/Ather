import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, IsUUID, ValidateNested } from 'class-validator';

export class PlayedDynamicChoiceDto {
  @IsString()
  @IsNotEmpty()
  scene_id!: string;

  @IsString()
  @IsNotEmpty()
  choice_id!: string;
}

export class PlayDynamicScriptDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PlayedDynamicChoiceDto)
  played_path!: PlayedDynamicChoiceDto[];
}

export class PlayDynamicScriptParamsDto {
  @IsUUID()
  script_id!: string;
}
