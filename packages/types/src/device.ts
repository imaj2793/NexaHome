import { z } from 'zod';

/** Jenis perangkat yang didukung (blueprint §7 — model abstrak). */
export const DeviceTypeSchema = z.enum([
  'light',
  'switch',
  'sensor',
  'climate',
  'media',
  'lock',
  'camera',
  'other',
]);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

/** Kemampuan (capability) perangkat — Nexa hanya tahu ini, bukan cara kerja perangkat. */
export const DeviceCapabilitySchema = z.enum([
  'power',
  'brightness',
  'color',
  'temperature',
  'humidity',
  'motion',
  'energy',
]);
export type DeviceCapability = z.infer<typeof DeviceCapabilitySchema>;

/** State perangkat saat ini — objek bebas sesuai capability (blueprint §7). */
export const DeviceStateSchema = z.record(z.string(), z.unknown());
export type DeviceState = z.infer<typeof DeviceStateSchema>;

/** Model perangkat (blueprint §7). */
export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: DeviceTypeSchema,
  roomId: z.string().nullable(),
  homeId: z.string(),
  integrationId: z.string().nullable(),
  capabilities: z.array(DeviceCapabilitySchema),
  state: DeviceStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const CreateDeviceInputSchema = z.object({
  name: z.string().min(1),
  type: DeviceTypeSchema,
  roomId: z.string().nullable().optional(),
  integrationId: z.string().nullable().optional(),
  capabilities: z.array(DeviceCapabilitySchema).default([]),
  state: DeviceStateSchema.default({}),
});
export type CreateDeviceInput = z.infer<typeof CreateDeviceInputSchema>;

export const UpdateDeviceInputSchema = CreateDeviceInputSchema.partial();
export type UpdateDeviceInput = z.infer<typeof UpdateDeviceInputSchema>;
