import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsString()
  homeId!: string;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  integrationId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsObject()
  state?: Record<string, unknown>;
}
