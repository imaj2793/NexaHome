'use client';

import type { ApiDevice } from '@/lib/api';

const TYPE_ICONS: Record<string, string> = {
  light: '💡',
  bulb: '💡',
  ac: '❄️',
  tv: '📺',
  fan: '🌀',
  sensor: '📡',
  switch: '🔘',
  thermostat: '🌡️',
  plug: '🔌',
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgbToHex(c?: unknown): string {
  const { r = 255, g = 255, b = 255 } = (c ?? {}) as Partial<Rgb>;
  const to = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToRgb(hex: string): Rgb {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

interface DeviceCardProps {
  device: ApiDevice;
  busy: boolean;
  onToggle: () => void;
  onBrightness: (value: number) => void;
  onColor: (rgb: Rgb) => void;
  onDelete: () => void;
}

export default function DeviceCard({
  device,
  busy,
  onToggle,
  onBrightness,
  onColor,
  onDelete,
}: DeviceCardProps) {
  const state = device.state as {
    power?: boolean;
    brightness?: number;
    color?: Rgb;
  };
  const powered = state.power === true;
  const brightness = typeof state.brightness === 'number' ? state.brightness : 100;
  const caps = device.capabilities ?? [];
  const icon = TYPE_ICONS[device.type] ?? '🔌';
  const showBrightness = caps.includes('brightness');
  const showColor = caps.includes('color');

  return (
    <div
      className={`group rounded-2xl border bg-slate-900/60 p-4 transition ${
        powered ? 'border-indigo-500/40' : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div className="min-w-0">
            <div className="truncate font-medium">{device.name}</div>
            <div className="mt-0.5 truncate text-xs text-slate-400">
              {device.room ? device.room.name : 'Tanpa ruangan'} ·{' '}
              <span className="capitalize">{device.type}</span>
              {device.externalId ? (
                <span className="text-slate-600"> · {device.externalId}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onDelete}
            title="Hapus perangkat"
            aria-label="Hapus perangkat"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
          >
            ✕
          </button>
          <button
            onClick={onToggle}
            disabled={busy}
            className={`h-10 w-10 rounded-full text-lg transition disabled:opacity-50 ${
              powered
                ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_16px_rgba(251,191,36,0.35)]'
                : 'bg-slate-800 text-slate-400'
            }`}
            aria-label={powered ? 'Matikan' : 'Nyalakan'}
          >
            {icon}
          </button>
        </div>
      </div>

      {powered && (showBrightness || showColor) && (
        <div className="mt-4 space-y-3">
          {showBrightness && (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Kecerahan</span>
                <span className="tabular-nums text-slate-500">{brightness}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={brightness}
                onChange={(e) => onBrightness(Number(e.target.value))}
                className="mt-1 w-full accent-indigo-500"
                aria-label="Kecerahan"
              />
            </div>
          )}
          {showColor && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Warna</span>
              <input
                type="color"
                value={rgbToHex(state.color)}
                onChange={(e) => onColor(hexToRgb(e.target.value))}
                className="h-7 w-9 cursor-pointer rounded border border-slate-700 bg-transparent p-0.5"
                aria-label="Warna"
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-500">
        {powered ? 'Menyala' : 'Mati'}
      </div>
    </div>
  );
}
