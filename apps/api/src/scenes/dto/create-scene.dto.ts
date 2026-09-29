import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SceneActionDto {
  @IsString()
  deviceId!: string;

  // JSON dengan bentuk { "action": string, "value"?: unknown }.
  // Contoh: {"action":"turn_on"} atau {"action":"set_brightness","value":60}.
  @IsObject()
  action!: Record<string, unknown>;
}

export class CreateSceneDto {
  @IsString()
  name!: string;

  @IsString()
  homeId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneActionDto)
  actions!: SceneActionDto[];
}
