import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateHomeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
