'use client';

import { useState } from 'react';
import { api, type ApiIntegration, type ApiRoom, type DiscoveredDevice } from '@/lib/api';

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
  const [integrationId, setIntegrationId] = useState(
    integrations[0]?.id ?? '',
  );
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="font-semibold tracking-tight">Tambah Perangkat</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Tutup"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-slate-800 p-1">
            <button
              onClick={() => setManual(false)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
                !manual ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              Otomatis (scan)
            </button>
            <button
              onClick={() => setManual(true)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
                manual ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              Manual
            </button>
          </div>

          {/* Integrasi & ruangan */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-slate-400">Integrasi</span>
              <select
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                {integrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-slate-400">Ruangan</span>
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Tanpa ruangan</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {!manual ? (
            <>
              <button
                onClick={scan}
                disabled={scanning || !integrationId}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50"
              >
                {scanning ? 'Memindai…' : 'Scan jaringan'}
              </button>

              {discovered.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    Ditemukan {discovered.length} perangkat:
                  </p>
                  {discovered.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{d.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {d.id} · <span className="capitalize">{d.type}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => connect(d)}
                        disabled={connectingId === d.id}
                        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {connectingId === d.id ? '…' : 'Hubungkan'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-slate-400">Nama</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Lampu Teras"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-slate-400">Tipe</span>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-slate-400">IP / MAC</span>
                  <input
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    placeholder="192.168.1.10"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </label>
              </div>
              <button
                onClick={addManual}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:from-indigo-500 hover:to-cyan-500"
              >
                Tambahkan
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
