'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type ApiActivityLog,
  type ApiDevice,
  type ApiHome,
  type ApiRoom,
} from '@/lib/api';
import { clearSession, getToken, getUser } from '@/lib/auth';
import { connectSocket, type DeviceStateEvent } from '@/lib/socket';

export default function DashboardPage() {
  const router = useRouter();
  const [home, setHome] = useState<ApiHome | null>(null);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [logs, setLogs] = useState<ApiActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const homes = await api<ApiHome[]>('/homes');
      if (!homes.length) {
        setHome(null);
        setRooms([]);
        setDevices([]);
        setLogs([]);
        return;
      }
      const h = homes[0];
      setHome(h);
      const [roomsRes, devicesRes, logsRes] = await Promise.all([
        api<ApiRoom[]>(`/rooms?homeId=${h.id}`),
        api<ApiDevice[]>(`/devices?homeId=${h.id}`),
        api<ApiActivityLog[]>(`/activity-log?homeId=${h.id}&limit=10`),
      ]);
      setRooms(roomsRes);
      setDevices(devicesRes);
      setLogs(logsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [load, router]);

  // Live update via WebSocket: state perangkat berubah → perbarui tanpa reload.
  useEffect(() => {
    if (!getToken()) return;
    const socket = connectSocket();
    socket.on('device:state', (data: DeviceStateEvent) => {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === data.deviceId ? { ...d, state: data.state } : d,
        ),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  async function toggleDevice(device: ApiDevice) {
    const state = device.state as { power?: boolean };
    const action = state.power ? 'turn_off' : 'turn_on';
    setBusyId(device.id);
    try {
      const res = await api<{ state: Record<string, unknown> }>(
        `/devices/${device.id}/commands`,
        { method: 'POST', body: JSON.stringify({ action }) },
      );
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, state: res.state } : d)),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah perangkat.');
    } finally {
      setBusyId(null);
    }
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const stats = useMemo(() => {
    const total = devices.length;
    const active = devices.filter(
      (d) => (d.state as { power?: boolean }).power === true,
    ).length;
    return { total, active, offline: total - active };
  }, [devices]);

  const user = getUser();

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <span className="font-semibold tracking-tight">NexaHome</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-400 sm:block">
              {user?.email ?? ''}
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="text-2xl font-semibold">
          {home ? home.name : 'Dashboard'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Good evening — kendalikan rumahmu dari satu tempat.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-slate-400">Memuat…</p>
        ) : !home ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
            Belum ada home. Jalankan <code className="text-indigo-400">pnpm db:seed</code>{' '}
            untuk membuat data contoh.
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              {[
                { label: 'Devices', value: stats.total },
                { label: 'Active', value: stats.active },
                { label: 'Offline', value: stats.offline },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="text-3xl font-semibold">{s.value}</div>
                  <div className="mt-1 text-sm text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Rooms */}
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                Rooms
              </h3>
              <div className="flex flex-wrap gap-2">
                {rooms.map((r) => (
                  <span
                    key={r.id}
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm"
                  >
                    {r.name}
                  </span>
                ))}
                {!rooms.length && (
                  <span className="text-sm text-slate-500">
                    Belum ada ruangan.
                  </span>
                )}
              </div>
            </div>

            {/* Devices */}
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                Devices
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {devices.map((d) => (
                  <DeviceCard
                    key={d.id}
                    device={d}
                    busy={busyId === d.id}
                    onToggle={() => toggleDevice(d)}
                  />
                ))}
                {!devices.length && (
                  <p className="text-sm text-slate-500">
                    Belum ada perangkat.
                  </p>
                )}
              </div>
            </div>

            {/* Recent activity */}
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                Recent Activity
              </h3>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm last:border-0"
                  >
                    <span>{l.message}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(l.createdAt).toLocaleTimeString('id-ID')}
                    </span>
                  </div>
                ))}
                {!logs.length && (
                  <p className="px-4 py-3 text-sm text-slate-500">
                    Belum ada aktivitas.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function DeviceCard({
  device,
  busy,
  onToggle,
}: {
  device: ApiDevice;
  busy: boolean;
  onToggle: () => void;
}) {
  const state = device.state as {
    power?: boolean;
    brightness?: number;
  };
  const isLight = device.type === 'light';
  const powered = state.power === true;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{device.name}</div>
          <div className="mt-0.5 text-xs capitalize text-slate-400">
            {device.room ? device.room.name : 'Tanpa ruangan'} · {device.type}
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={busy}
          className={`h-10 w-10 rounded-full text-lg transition ${
            powered
              ? 'bg-amber-400 text-amber-950'
              : 'bg-slate-800 text-slate-400'
          } disabled:opacity-50`}
          aria-label={powered ? 'Matikan' : 'Nyalakan'}
        >
          💡
        </button>
      </div>

      {isLight && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <span className="text-slate-500">
            {powered ? 'Menyala' : 'Mati'}
          </span>
          {powered && typeof state.brightness === 'number' && (
            <>
              <span className="text-slate-600">·</span>
              <span>Kecerahan {state.brightness}%</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
