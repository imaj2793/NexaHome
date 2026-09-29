import {
  clearSession,
  getRefreshToken,
  getToken,
  updateSessionTokens,
} from './auth';

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
  let res = await request(path, options);

  // Access token kedaluwarsa → coba refresh sekali, lalu ulangi request.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      res = await request(path, options, fresh);
    } else {
      clearSession();
    }
  }

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

/** Logout: cabut refresh token di server, lalu bersihkan sesi lokal. */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    // abaikan error jaringan — sesi lokal tetap dibersihkan
  } finally {
    clearSession();
  }
}

function request(
  path: string,
  options: RequestInit,
  token = getToken(),
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      updateSessionTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
