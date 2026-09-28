import { IsOptional, IsString } from 'class-validator';

export class DeviceCommandDto {
  @IsString()
  action!: string;

  // value fleksibel: number (brightness/temperature) atau object (color).
  @IsOptional()
  value?: unknown;
}
