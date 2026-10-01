'use client';

import { Home, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AddDeviceModal from '@/components/add-device-modal';
import { ConnectionBadge, SECTIONS, Sidebar, Topbar, type SectionId } from '@/components/app-shell';
import type { DeviceGridProps } from '@/components/device-grid';
import NexaChat from '@/components/nexa-chat';
import { ActivitySection } from '@/components/sections/activity';
import { AutomationsSection } from '@/components/sections/automations';
import { IntegrationsSection } from '@/components/sections/integrations';
import { OverviewSection } from '@/components/sections/overview';
import { RoomsSection } from '@/components/sections/rooms';
import { ScenesSection } from '@/components/sections/scenes';
import { EmptyState } from '@/components/section-parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { cn } from '@/lib/cn';
import { deviceStatus } from '@/lib/devices';
import type { NexaState } from '@/lib/nexa';
import { connectSocket, joinHome, type DeviceStateEvent } from '@/lib/socket';

const SUBTITLES: Record<SectionId, string> = {
  overview: 'Kondisi rumah sekarang.',
  rooms: 'Perangkat dikelompokkan per ruangan.',
  scenes: 'Sekumpulan aksi yang dijalankan sekaligus.',
  automations: 'Aturan yang berjalan tanpa perlu perintah.',
  activity: 'Jejak perubahan terakhir.',
  integrations: 'Bridge ke perangkat di jaringanmu.',
};

export default function DashboardPage() {
  const router = useRouter();
  const [section, setSection] = useState<SectionId>('overview');
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
  const [connected, setConnected] = useState(false);
  const [nexaState, setNexaState] = useState<NexaState>('IDLE');

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
  // Event hanya diterima setelah server memverifikasi token dan kita diizinkan
  // masuk ke room home ini.
  useEffect(() => {
    if (!getToken() || !home) return;
    const socket = connectSocket();
    socket.on('connect', () => {
      setConnected(true);
      joinHome(socket, home.id);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('device:state', (data: DeviceStateEvent) => {
      if (data.homeId !== home.id) return;
      setDevices((prev) =>
        prev.map((d) =>
          d.id === data.deviceId ? { ...d, state: data.state } : d,
        ),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, [home?.id]);

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

  async function activateScene(scene: ApiScene) {
    setBusyScene(scene.id);
    try {
      await api(`/scenes/${scene.id}/activate`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan adegan.');
    } finally {
      setBusyScene(null);
    }
  }

  async function runAutomation(automation: ApiAutomation) {
    try {
      await api(`/automations/${automation.id}/run`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan otomasi.');
    }
  }

  const stats = useMemo(() => {
    const on = devices.filter((d) => deviceStatus(d) === 'on').length;
    return {
      total: devices.length,
      active: on,
      off: devices.length - on,
      rooms: rooms.length,
    };
  }, [devices, rooms]);

  const gridProps: DeviceGridProps = {
    devices,
    busyId,
    onToggle: toggleDevice,
    onBrightness: (d, v) => sendCommand(d, 'set_brightness', v),
    onColor: (d, rgb) => sendCommand(d, 'set_color', rgb),
    onDelete: deleteDevice,
  };

  const user = getUser();
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar
        active={section}
        onSelect={setSection}
        user={user}
        nexaState={nexaState}
        onLogout={logout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={active.label}
          subtitle={SUBTITLES[section]}
          actions={
            <>
              <ConnectionBadge connected={connected} />
              <Button size="sm" variant="primary" onClick={() => setShowAddDevice(true)}>
                <Plus aria-hidden />
                <span className="hidden sm:inline">Perangkat</span>
              </Button>
            </>
          }
        />

        <main className="flex-1 px-6 py-6">
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-[var(--radius-control)] bg-critical-soft px-4 py-3 text-sm text-critical"
            >
              {error}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-ink-muted">Memuat…</p>
          ) : !home ? (
            <EmptyState
              icon={<Home aria-hidden />}
              title="Belum ada home"
              hint="Jalankan pnpm db:seed di repo untuk membuat data contoh."
            />
          ) : (
            <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0">
                {section === 'overview' && (
                  <OverviewSection
                    {...gridProps}
                    rooms={rooms}
                    integrations={integrations}
                    scenes={scenes}
                    automations={automations}
                    stats={stats}
                    onAddDevice={() => setShowAddDevice(true)}
                    onAddRoom={() => {
                      setSection('rooms');
                      setAddingRoom(true);
                    }}
                    onGoTo={setSection}
                  />
                )}
                {section === 'rooms' && (
                  <RoomsSection
                    {...gridProps}
                    rooms={rooms}
                    addingRoom={addingRoom}
                    newRoomName={newRoomName}
                    onNewRoomName={setNewRoomName}
                    onSubmitRoom={addRoom}
                    onCancelRoom={() => {
                      setAddingRoom(false);
                      setNewRoomName('');
                    }}
                    onStartRoom={() => setAddingRoom(true)}
                    onAddDevice={() => setShowAddDevice(true)}
                  />
                )}
                {section === 'scenes' && (
                  <ScenesSection
                    scenes={scenes}
                    busyScene={busyScene}
                    onActivate={activateScene}
                  />
                )}
                {section === 'automations' && (
                  <AutomationsSection automations={automations} onRun={runAutomation} />
                )}
                {section === 'activity' && <ActivitySection logs={logs} />}
                {section === 'integrations' && (
                  <IntegrationsSection integrations={integrations} />
                )}
              </div>

              <aside
                className={cn(
                  'h-[30rem]',
                  '2xl:sticky 2xl:top-[5.5rem] 2xl:h-[calc(100dvh-5.5rem)]',
                )}
              >
                <Card className="h-full overflow-hidden">
                  <NexaChat homeId={home.id} onNexaState={setNexaState} />
                </Card>
              </aside>
            </div>
          )}
        </main>
      </div>

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
    </div>
  );
}
