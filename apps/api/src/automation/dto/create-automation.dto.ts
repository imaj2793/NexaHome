import { AutomationTriggerType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateAutomationTriggerDto {
  @IsEnum(AutomationTriggerType)
  type!: AutomationTriggerType;

  @IsObject()
  config!: Record<string, unknown>;
}

export class CreateAutomationActionDto {
  @IsOptional()
  @IsString()
  deviceId?: string | null;

  @IsObject()
  action!: Record<string, unknown>;
}

export class CreateAutomationDto {
  @IsString()
  name!: string;

  @IsString()
  homeId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAutomationTriggerDto)
  triggers!: CreateAutomationTriggerDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAutomationActionDto)
  actions!: CreateAutomationActionDto[];
}
