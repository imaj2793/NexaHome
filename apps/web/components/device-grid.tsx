'use client';

import DeviceCard from '@/components/device-card';
import type { ApiDevice } from '@/lib/api';

export interface DeviceGridProps {
  devices: ApiDevice[];
  busyId: string | null;
  onToggle: (device: ApiDevice) => void;
  onBrightness: (device: ApiDevice, value: number) => void;
  onColor: (device: ApiDevice, rgb: { r: number; g: number; b: number }) => void;
  onDelete: (device: ApiDevice) => void;
}

/**
 * Grid kartu perangkat.
 *
 * Handler dikembalikan dari halaman sebagai fungsi yang menerima perangkatnya,
 * jadi tiap section hanya perlu meneruskan `devices` yang relevan.
 */
export function DeviceGrid({ devices, ...handlers }: DeviceGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {devices.map((d) => (
        <DeviceCard
          key={d.id}
          device={d}
          busy={handlers.busyId === d.id}
          onToggle={() => handlers.onToggle(d)}
          onBrightness={(v) => handlers.onBrightness(d, v)}
          onColor={(rgb) => handlers.onColor(d, rgb)}
          onDelete={() => handlers.onDelete(d)}
        />
      ))}
    </div>
  );
}
