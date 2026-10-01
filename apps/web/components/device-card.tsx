'use client';

import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ApiDevice } from '@/lib/api';
import { cn } from '@/lib/cn';
import { deviceMeta, deviceStatus } from '@/lib/devices';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface DeviceCardProps {
  device: ApiDevice;
  busy: boolean;
  onToggle: () => void;
  onBrightness: (value: number) => void;
  onColor: (rgb: Rgb) => void;
  onDelete: () => void;
}

/** Tanpa warna tersimpan, dianggap putih — bukan hitam yang tak terlihat. */
const DEFAULT_HEX = '#ffffff';

const rgbToHex = (value: unknown): string => {
  const color = (value ?? {}) as Partial<Rgb>;
  if (color.r == null && color.g == null && color.b == null) return DEFAULT_HEX;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[color.r, color.g, color.b]
    .map((n) => clamp(n ?? 0).toString(16).padStart(2, '0'))
    .join('')}`;
};

const hexToRgb = (hex: string): Rgb => {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

/**
 * Kartu satu perangkat.
 *
 * Susunan disengaja: status (nama + ikon) di kiri, kendali di kanan, dan
 * kontrol tambahan (brightness/warna) hanya muncul saat perangkat menyala —
 * supaya grid tetap bisa dibaca kalau banyak perangkat mati.
 */
export default function DeviceCard({
  device,
  busy,
  onToggle,
  onBrightness,
  onColor,
  onDelete,
}: DeviceCardProps) {
  const { icon: Icon, label: typeLabel } = deviceMeta(device.type);
  const status = deviceStatus(device);
  const isOn = status === 'on';
  const online = device.state?.online !== false;

  const capabilities = device.capabilities ?? [];
  const brightness = Number(device.state?.brightness ?? 100);
  const color = rgbToHex(device.state?.color);

  return (
    <article
      data-status={status}
      className={cn(
        'group relative flex flex-col gap-3 rounded-[var(--radius-card)] border bg-surface p-4',
        'transition-[border-color,box-shadow] duration-200',
        isOn
          ? 'border-accent/35 shadow-[var(--shadow-soft)]'
          : 'border-line hover:border-line-strong',
        !online && 'opacity-70',
      )}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)]',
            'transition-colors duration-200',
            isOn ? 'bg-accent-soft text-accent' : 'bg-surface-sunken text-ink-subtle',
          )}
        >
          <Icon className="size-[1.125rem]" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{device.name}</h3>
          <p className="mt-0.5 truncate text-xs text-ink-subtle">
            {[
              device.room?.name ?? 'Tanpa ruangan',
              typeLabel,
              device.externalId,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {online ? (
            <Badge tone={isOn ? 'positive' : 'neutral'}>
              {isOn ? 'Menyala' : 'Mati'}
            </Badge>
          ) : (
            <Badge tone="neutral">Offline</Badge>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Hapus ${device.name}`}
            onClick={onDelete}
            className="text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 aria-hidden />
          </Button>
          <Switch
            checked={isOn}
            disabled={busy}
            onCheckedChange={onToggle}
            aria-label={isOn ? `Matikan ${device.name}` : `Nyalakan ${device.name}`}
          />
        </div>
      </header>

      {/* Kontrol tambahan hanya saat perangkat menyala: kecerahan/warna pada
          lampu yang mati tidak berarti, dan mengubahnya akan sia-sia. */}
      {isOn && (capabilities.includes('brightness') || capabilities.includes('color')) && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {capabilities.includes('brightness') && (
            <label className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-ink-muted">Kecerahan</span>
              <input
                type="range"
                min={0}
                max={100}
                value={brightness}
                aria-label={`Kecerahan ${device.name}`}
                onChange={(e) => onBrightness(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-sunken accent-accent"
              />
              <span className="w-10 shrink-0 text-right text-xs text-ink-muted tabular-nums">
                {brightness}%
              </span>
            </label>
          )}

          {capabilities.includes('color') && (
            <label className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-ink-muted">Warna</span>
              <input
                type="color"
                value={color}
                aria-label={`Warna ${device.name}`}
                onChange={(e) => onColor(hexToRgb(e.target.value))}
                className="h-7 w-full cursor-pointer rounded-md border border-line bg-surface p-0.5"
              />
            </label>
          )}
        </div>
      )}
    </article>
  );
}
