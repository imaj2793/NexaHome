'use client';

import { Radar } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type ApiIntegration, type ApiRoom, type DiscoveredDevice } from '@/lib/api';
import { deviceMeta } from '@/lib/devices';

interface AddDeviceModalProps {
  homeId: string;
  integrations: ApiIntegration[];
  rooms: ApiRoom[];
  onClose: () => void;
  onAdded: () => void;
}

const TYPE_OPTIONS = ['light', 'sensor', 'switch', 'ac', 'tv', 'fan', 'thermostat'];

export default function AddDeviceModal({
  homeId,
  integrations,
  rooms,
  onClose,
  onAdded,
}: AddDeviceModalProps) {
  const [integrationId, setIntegrationId] = useState(integrations[0]?.id ?? '');
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  // Manual form
  const [name, setName] = useState('');
  const [type, setType] = useState('light');
  const [externalId, setExternalId] = useState('');
  const [roomId, setRoomId] = useState('');

  async function scan() {
    if (!integrationId) return;
    setScanning(true);
    setError(null);
    setDiscovered([]);
    try {
      const found = await api<DiscoveredDevice[]>(
        `/integrations/${integrationId}/discover`,
        { method: 'POST' },
      );
      setDiscovered(found);
      if (!found.length) setError('Tidak ada perangkat ditemukan di jaringan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal scan jaringan.');
    } finally {
      setScanning(false);
    }
  }

  async function connect(d: DiscoveredDevice) {
    setConnectingId(d.id);
    setError(null);
    try {
      await api('/devices', {
        method: 'POST',
        body: JSON.stringify({
          name: d.name,
          type: d.type,
          homeId,
          roomId: roomId || null,
          integrationId: integrationId || null,
          externalId: d.id,
          capabilities: d.capabilities,
          state: d.state,
        }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghubungkan.');
    } finally {
      setConnectingId(null);
    }
  }

  async function addManual() {
    setError(null);
    if (!name.trim()) {
      setError('Nama perangkat wajib diisi.');
      return;
    }
    try {
      await api('/devices', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type,
          homeId,
          roomId: roomId || null,
          integrationId: integrationId || null,
          externalId: externalId.trim() || null,
          capabilities: [],
          state: {},
        }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah perangkat.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onPointerDownOutside={onClose}>
        <DialogHeader>
          <DialogTitle>Tambah Perangkat</DialogTitle>
          <DialogDescription>
            Pindai jaringan lewat integrasi, atau masukkan perangkat secara manual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Mode toggle */}
          <div
            aria-label="Cara menambahkan"
            className="flex rounded-[var(--radius-control)] bg-surface-sunken p-1"
          >
            <ModeTab active={!manual} onClick={() => setManual(false)}>
              Otomatis (scan)
            </ModeTab>
            <ModeTab active={manual} onClick={() => setManual(true)}>
              Manual
            </ModeTab>
          </div>

          {/* Integrasi & ruangan */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="integration">Integrasi</Label>
              <select
                id="integration"
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                className="h-9.5 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-sm text-ink transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-none"
              >
                {integrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="room">Ruangan</Label>
              <select
                id="room"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="h-9.5 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-sm text-ink transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-none"
              >
                <option value="">Tanpa ruangan</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-control)] bg-critical-soft px-3 py-2 text-sm text-critical"
            >
              {error}
            </p>
          )}

          {!manual ? (
            <>
              <Button
                variant="primary"
                onClick={scan}
                disabled={scanning || !integrationId}
                loading={scanning}
                loadingText="Memindai…"
              >
                {!scanning && <Radar aria-hidden />}
                Scan jaringan
              </Button>

              {discovered.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-ink-muted">
                    Ditemukan {discovered.length} perangkat:
                  </p>
                  {discovered.map((d) => (
                    <DiscoveredRow
                      key={d.id}
                      device={d}
                      busy={connectingId === d.id}
                      onConnect={() => connect(d)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="device-name">Nama</Label>
                <Input
                  id="device-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Lampu Teras"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="device-type">Tipe</Label>
                  <select
                    id="device-type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="h-9.5 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-sm text-ink transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-none"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="device-external">IP / MAC</Label>
                  <Input
                    id="device-external"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    placeholder="192.168.1.10"
                  />
                </div>
              </div>
              <Button variant="primary" onClick={addManual}>
                Tambahkan
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'flex-1 rounded-[calc(var(--radius-control)-0.25rem)] px-3 py-1.5 text-sm',
        'transition-colors',
        active
          ? 'bg-surface font-medium text-ink shadow-[var(--shadow-soft)]'
          : 'text-ink-muted hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function DiscoveredRow({
  device,
  busy,
  onConnect,
}: {
  device: DiscoveredDevice;
  busy: boolean;
  onConnect: () => void;
}) {
  const { icon: Icon, label } = deviceMeta(device.type);
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-surface-sunken text-ink-subtle">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{device.name}</p>
        <p className="truncate text-xs text-ink-subtle">
          {device.id} · {label}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onConnect} loading={busy} loadingText="…">
        Hubungkan
      </Button>
    </div>
  );
}