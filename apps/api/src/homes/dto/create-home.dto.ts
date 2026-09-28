import { IsString, MinLength } from 'class-validator';

export class CreateHomeDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
