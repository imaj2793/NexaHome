'use client';

import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

/** Hubungkan ke gateway WebSocket NexaHome (socket.io). */
export function connectSocket(): Socket {
  return io(SOCKET_URL, { transports: ['websocket', 'polling'] });
}

export interface DeviceStateEvent {
  homeId: string;
  deviceId: string;
  state: Record<string, unknown>;
}
