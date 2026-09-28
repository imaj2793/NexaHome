import { IntegrationType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateIntegrationDto {
  @IsString()
  name!: string;

  @IsEnum(IntegrationType)
  type!: IntegrationType;

  @IsString()
  homeId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
