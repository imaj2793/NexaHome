import { IsString } from 'class-validator';

export class NexaChatDto {
  @IsString()
  message!: string;
}
