import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsObject()
  state?: Record<string, unknown>;
}
