import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class DeviceCommandDto {
  @IsString()
  action!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  value?: number;
}
