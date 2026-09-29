import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  CreateAutomationActionDto,
  CreateAutomationTriggerDto,
} from './create-automation.dto';

export class UpdateAutomationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  homeId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAutomationTriggerDto)
  triggers?: CreateAutomationTriggerDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAutomationActionDto)
  actions?: CreateAutomationActionDto[];
}
