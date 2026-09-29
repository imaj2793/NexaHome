import { IsBase64, IsOptional, IsString } from 'class-validator';

export class NexaTranscribeDto {
  /** Audio (WebM/Opus dari MediaRecorder) ter-encode base64. */
  @IsBase64()
  audio!: string;

  @IsOptional()
  @IsString()
  mime?: string;
}
