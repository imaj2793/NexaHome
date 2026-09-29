'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  api,
  logout as logoutApi,
  type ApiActivityLog,
  type ApiAutomation,
  type ApiDevice,
  type ApiHome,
  type ApiIntegration,
  type ApiRoom,
  type ApiScene,
} from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { connectSocket, type DeviceStateEvent } from '@/lib/socket';
import NexaChat from '@/components/nexa-chat';
import DeviceCard from '@/components/device-card';
import AddDeviceModal from '@/components/add-device-modal';

export default function DashboardPage() {
  const router = useRouter();
  const [home, setHome] = useState<ApiHome | null>(null);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [logs, setLogs] = useState<ApiActivityLog[]>([]);
  const [scenes, setScenes] = useState<ApiScene[]>([]);
  const [automations, setAutomations] = useState<ApiAutomation[]>([]);
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [busyScene, setBusyScene] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const homes = await api<ApiHome[]>('/homes');
      if (!homes.length) {
        setHome(null);
        setRooms([]);
        setDevices([]);
        setLogs([]);
        setScenes([]);
        setAutomations([]);
        setIntegrations([]);
        return;
      }
      const h = homes[0];
      setHome(h);
      const [
        roomsRes,
        devicesRes,
        logsRes,
        scenesRes,
        automationsRes,
        integrationsRes,
      ] = await Promise.all([
        api<ApiRoom[]>(`/rooms?homeId=${h.id}`),
        api<ApiDevice[]>(`/devices?homeId=${h.id}`),
        api<ApiActivityLog[]>(`/activity-log?homeId=${h.id}&limit=50`),
        api<ApiScene[]>(`/scenes?homeId=${h.id}`),
        api<ApiAutomation[]>(`/automations?homeId=${h.id}`),
        api<ApiIntegration[]>(`/integrations?homeId=${h.id}`),
      ]);
      setRooms(roomsRes);
      setDevices(devicesRes);
      setLogs(logsRes);
      setScenes(scenesRes);
      setAutomations(automationsRes);
      setIntegrations(integrationsRes);
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

  // Tutup modal riwayat dengan Escape.
  useEffect(() => {
    if (!showHistory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHistory(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHistory]);

  async function sendCommand(
    device: ApiDevice,
    action: string,
    value?: unknown,
  ) {
    setBusyId(device.id);
    try {
      const res = await api<{ state: Record<string, unknown> }>(
        `/devices/${device.id}/commands`,
        { method: 'POST', body: JSON.stringify({ action, value }) },
      );
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, state: res.state } : d)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah perangkat.');
    } finally {
      setBusyId(null);
    }
  }

  function toggleDevice(device: ApiDevice) {
    const state = device.state as { power?: boolean };
    return sendCommand(device, state.power ? 'turn_off' : 'turn_on');
  }

  async function deleteDevice(device: ApiDevice) {
    try {
      await api(`/devices/${device.id}`, { method: 'DELETE' });
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus perangkat.');
    }
  }

  async function addRoom() {
    const name = newRoomName.trim();
    if (!name || !home) return;
    try {
      await api('/rooms', {
        method: 'POST',
        body: JSON.stringify({ name, homeId: home.id }),
      });
      setNewRoomName('');
      setAddingRoom(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah ruangan.');
    }
  }

  async function logout() {
    await logoutApi();
    router.replace('/login');
  }

  async function activateScene(id: string) {
    setBusyScene(id);
    try {
      await api(`/scenes/${id}/activate`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan scene.');
    } finally {
      setBusyScene(null);
    }
  }

  async function runAutomation(id: string) {
    try {
      await api(`/automations/${id}/run`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menjalankan automation.',
      );
    }
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
    <main className="min-h-screen bg-[radial-gradient(ellipse_60%_40%_at_50%_-10%,rgba(99,102,241,0.12),transparent)]">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="NexaHome"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent font-semibold tracking-tight">
              NexaHome
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:block">
              {user?.email ?? ''}
            </span>
            <button
              onClick={() => setShowHistory(true)}
              title="Riwayat aktivitas"
              aria-label="Riwayat aktivitas"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-indigo-500/50 hover:text-indigo-300"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
            </button>
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
          Kendalikan rumahmu dari satu tempat — atau bilang{' '}
          <span className="text-indigo-400">&quot;Hi Nexa&quot;</span>.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            {loading ? (
              <p className="text-slate-400">Memuat…</p>
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
                { label: 'Perangkat', value: stats.total, icon: '💡' },
                { label: 'Aktif', value: stats.active, icon: '🟢' },
                { label: 'Mati', value: stats.offline, icon: '⚪' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {s.label}
                    </span>
                    <span className="text-lg">{s.icon}</span>
                  </div>
                  <div className="mt-2 bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-3xl font-semibold text-transparent">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Rooms */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-wide text-slate-400">
                  Rooms
                </h3>
                <button
                  onClick={() => setAddingRoom(true)}
                  className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
                >
                  + Ruangan
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {rooms.map((r) => (
                  <span
                    key={r.id}
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm"
                  >
                    {r.name}
                  </span>
                ))}
                {addingRoom && (
                  <input
                    autoFocus
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addRoom();
                      if (e.key === 'Escape') {
                        setAddingRoom(false);
                        setNewRoomName('');
                      }
                    }}
                    onBlur={() => {
                      if (!newRoomName.trim()) setAddingRoom(false);
                    }}
                    placeholder="Nama ruangan…"
                    className="w-40 rounded-full border border-indigo-500 bg-slate-950 px-3 py-1 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                )}
                {!rooms.length && !addingRoom && (
                  <span className="text-sm text-slate-500">
                    Belum ada ruangan.
                  </span>
                )}
              </div>
              {integrations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {integrations.map((i) => (
                    <span
                      key={i.id}
                      className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-500"
                    >
                      {i.name} · {i.type}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Devices */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-wide text-slate-400">
                  Devices
                </h3>
                <button
                  onClick={() => setShowAddDevice(true)}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:from-indigo-500 hover:to-cyan-500"
                >
                  + Tambah Perangkat
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {devices.map((d) => (
                  <DeviceCard
                    key={d.id}
                    device={d}
                    busy={busyId === d.id}
                    onToggle={() => toggleDevice(d)}
                    onBrightness={(v) => sendCommand(d, 'set_brightness', v)}
                    onColor={(rgb) => sendCommand(d, 'set_color', rgb)}
                    onDelete={() => deleteDevice(d)}
                  />
                ))}
                {!devices.length && (
                  <p className="text-sm text-slate-500">
                    Belum ada perangkat.
                  </p>
                )}
              </div>
            </div>

            {/* Scenes */}
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                Scenes
              </h3>
              <div className="flex flex-wrap gap-2">
                {scenes.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => activateScene(s.id)}
                    disabled={busyScene === s.id}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm transition hover:border-cyan-500/50 disabled:opacity-50"
                  >
                    {s.name}
                    <span className="ml-1 text-slate-500">
                      · {s.actions.length} aksi
                    </span>
                  </button>
                ))}
                {!scenes.length && (
                  <span className="text-sm text-slate-500">
                    Belum ada scene.
                  </span>
                )}
              </div>
            </div>

            {/* Automations */}
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                Automations
              </h3>
              <div className="space-y-2">
                {automations.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {a.triggers
                          .map(
                            (t) =>
                              (t.config as { time?: string }).time ?? t.type,
                          )
                          .join(', ')}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-xs ${a.enabled ? 'text-emerald-400' : 'text-slate-500'}`}
                      >
                        {a.enabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                      <button
                        onClick={() => runAutomation(a.id)}
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
                      >
                        Jalankan
                      </button>
                    </div>
                  </div>
                ))}
                {!automations.length && (
                  <span className="text-sm text-slate-500">
                    Belum ada automation.
                  </span>
                )}
              </div>
            </div>

          </>
          )}
          </div>

          <aside className="h-[70vh] xl:sticky xl:top-20">
            <NexaChat />
          </aside>
        </div>
      </div>

      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h3 className="font-semibold tracking-tight">Riwayat Aktivitas</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                aria-label="Tutup"
              >
                ✕
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 text-sm last:border-0"
                >
                  <span className="text-slate-200">{l.message}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {new Date(l.createdAt).toLocaleTimeString('id-ID')}
                  </span>
                </div>
              ))}
              {!logs.length && (
                <p className="px-5 py-6 text-center text-sm text-slate-500">
                  Belum ada aktivitas.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddDevice && home && (
        <AddDeviceModal
          homeId={home.id}
          integrations={integrations}
          rooms={rooms}
          onClose={() => setShowAddDevice(false)}
          onAdded={() => {
            setShowAddDevice(false);
            load();
          }}
        />
      )}
    </main>
  );
}
