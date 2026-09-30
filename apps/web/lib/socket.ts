'use client';

import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

/**
 * Hubungkan ke gateway WebSocket NexaHome (socket.io).
 *
 * Access token wajib dikirim saat handshake dan client harus mengirim
 * `home:join` — tanpa itu server menolak koneksi dan tidak ada event yang
 * diterima (dulu semua event dikirim ke semua pengguna).
 */
export function connectSocket(): Socket {
  const token = getToken();
  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: token ? { token } : {},
  });

  // Token bisa sudah ada setelah halaman dimuat (hydrasi selesai), dan
  // bisa berubah setelah login; kirim ulang saat connect berikutnya.
  socket.on('connect', () => {
    const fresh = getToken();
    if (fresh && (socket.auth as { token?: string } | undefined)?.token !== fresh) {
      socket.auth = { token: fresh };
      socket.disconnect().connect();
    }
  });

  return socket;
}

/** Minta server memasukkan socket ini ke room state milik sebuah home. */
export function joinHome(socket: Socket, homeId: string): void {
  if (!homeId) return;
  socket.emit('home:join', { homeId });
}

export interface DeviceStateEvent {
  homeId: string;
  deviceId: string;
  state: Record<string, unknown>;
}

export interface NexaStateEvent {
  homeId: string;
  state: string;
  message?: string;
}
