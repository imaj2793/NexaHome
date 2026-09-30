import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /**
   * Kredensial baru. Nilainya dienkripsi sebelum disimpan dan tidak pernah
   * dikembalikan apa adanya ke klien.
   */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
