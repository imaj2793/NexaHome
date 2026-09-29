import { getToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt?: string;
}

export interface ApiHome {
  id: string;
  name: string;
  ownerId: string;
  _count?: { rooms: number; devices: number };
}

export interface ApiRoom {
  id: string;
  name: string;
  homeId: string;
  _count?: { devices: number };
}

export interface ApiDevice {
  id: string;
  name: string;
  type: string;
  homeId: string;
  roomId: string | null;
  integrationId: string | null;
  externalId: string | null;
  capabilities: string[];
  state: Record<string, unknown>;
  room: { id: string; name: string } | null;
  integration?: { id: string; name: string } | null;
}

export interface ApiIntegration {
  id: string;
  name: string;
  type: string;
  homeId: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  state: Record<string, unknown>;
}

export interface ApiActivityLog {
  id: string;
  message: string;
  level: string;
  createdAt: string;
  device?: { id: string; name: string } | null;
}

export interface ApiScene {
  id: string;
  name: string;
  homeId: string;
  actions: Array<{
    id: string;
    deviceId: string;
    action: Record<string, unknown>;
  }>;
}

export interface ApiAutomation {
  id: string;
  name: string;
  homeId: string;
  enabled: boolean;
  triggers: Array<{
    id: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  actions: Array<{
    id: string;
    deviceId: string | null;
    action: Record<string, unknown>;
  }>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (body && typeof body.message === 'string' ? body.message : null) ??
      `Request gagal (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}
