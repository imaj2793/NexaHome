import { IsString, MaxLength } from 'class-validator';

export class NexaSpeechDto {
  @IsString()
  @MaxLength(500)
  text!: string;
}
