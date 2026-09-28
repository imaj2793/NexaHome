import { z } from 'zod';

/** State visual Nexa (blueprint §16) — 8 ekspresi. */
export const NexaStateSchema = z.enum([
  'IDLE',
  'LISTENING',
  'THINKING',
  'PROCESSING',
  'SUCCESS',
  'ERROR',
  'READY',
  'SLEEPING',
]);
export type NexaState = z.infer<typeof NexaStateSchema>;

/** Tools yang dijembatani Nexa AI ke NexaHome Core (blueprint §13). */
export const NexaToolSchema = z.enum([
  'get_devices',
  'get_device_status',
  'turn_on_device',
  'turn_off_device',
  'set_brightness',
  'set_color',
  'set_temperature',
  'get_room_status',
  'activate_scene',
  'create_automation',
  'get_energy_usage',
]);
export type NexaTool = z.infer<typeof NexaToolSchema>;

/** Event protokol Nexa (blueprint §17) — dikirim via WebSocket ke visual UI. */
export const NexaEventSchema = z.object({
  type: z.literal('nexa.state'),
  state: NexaStateSchema,
  message: z.string().optional(),
});
export type NexaEvent = z.infer<typeof NexaEventSchema>;

/** Kontrak respons Nexa AI (blueprint §41). */
export const NexaResponseSchema = z.object({
  message: z.string(),
  state: NexaStateSchema,
  tool: z
    .object({
      name: NexaToolSchema,
      success: z.boolean(),
    })
    .optional(),
});
export type NexaResponse = z.infer<typeof NexaResponseSchema>;

/** Sebuah tool-call yang diputuskan AI (blueprint §12). */
export const NexaToolCallSchema = z.object({
  tool: NexaToolSchema,
  arguments: z.record(z.string(), z.unknown()),
});
export type NexaToolCall = z.infer<typeof NexaToolCallSchema>;
