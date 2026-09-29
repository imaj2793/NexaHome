import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ConnectDevicePayloadDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsObject()
  state?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  vendor?: string;
}

export class ConnectDeviceDto {
  @IsString()
  homeId!: string;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  integrationId?: string | null;

  @ValidateNested()
  @Type(() => ConnectDevicePayloadDto)
  device!: ConnectDevicePayloadDto;
}
