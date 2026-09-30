import { z } from 'zod';

/** Home = rumah / lokasi utama pengguna. */
export interface Home {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const CreateHomeInputSchema = z.object({
  name: z.string().min(1),
});
export type CreateHomeInput = z.infer<typeof CreateHomeInputSchema>;

/** Room = ruangan di dalam sebuah home. */
export interface Room {
  id: string;
  name: string;
  homeId: string;
  createdAt: string;
  updatedAt: string;
}

export const CreateRoomInputSchema = z.object({
  name: z.string().min(1),
});
export type CreateRoomInput = z.infer<typeof CreateRoomInputSchema>;

/** Jenis integrasi perangkat (blueprint §8). */
export const IntegrationTypeSchema = z.enum(['mqtt', 'tasmota', 'esp32', 'shelly']);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export interface Integration {
  id: string;
  name: string;
  type: IntegrationType;
  homeId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Scene: beberapa perangkat dikontrol sekaligus (blueprint §18). */
export interface Scene {
  id: string;
  name: string;
  homeId: string;
  createdAt: string;
  updatedAt: string;
}

/** Automation: TRIGGER → CONDITION → ACTION (blueprint §19). */
export interface Automation {
  id: string;
  name: string;
  homeId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
