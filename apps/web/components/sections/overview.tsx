'use client';

import { Blocks, CircleDot, Plug, Power, Puzzle, Sparkles, Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SectionId } from '@/components/app-shell';
import { DeviceGrid, type DeviceGridProps } from '@/components/device-grid';
import { EmptyState, SectionHeading } from '@/components/section-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApiAutomation, ApiIntegration, ApiRoom, ApiScene } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface OverviewProps extends DeviceGridProps {
  rooms: ApiRoom[];
  integrations: ApiIntegration[];
  scenes: ApiScene[];
  automations: ApiAutomation[];
  stats: { total: number; active: number; off: number; rooms: number };
  onAddDevice: () => void;
  onAddRoom: () => void;
  onGoTo: (section: SectionId) => void;
}

/** Ringkasan: angka, perangkat, dan pintu masuk ke section lain. */
export function OverviewSection({
  rooms,
  integrations,
  scenes,
  automations,
  stats,
  onAddDevice,
  onAddRoom,
  onGoTo,
  ...grid
}: OverviewProps) {
  return (
    <div className="flex flex-col gap-7">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Perangkat" value={stats.total} icon={<Power aria-hidden />} />
        <Stat
          label="Menyala"
          value={stats.active}
          icon={<CircleDot aria-hidden />}
          tone="positive"
        />
        <Stat label="Mati" value={stats.off} icon={<Power aria-hidden />} />
        <Stat label="Ruang" value={stats.rooms} icon={<Blocks aria-hidden />} />
      </div>

      <section className="flex flex-col gap-4">
        <SectionHeading
          title="Perangkat"
          description="Perubahan status muncul langsung lewat koneksi realtime."
          action={
            <Button size="sm" variant="primary" onClick={onAddDevice}>
              Tambah perangkat
            </Button>
          }
        />
        {grid.devices.length ? (
          <DeviceGrid {...grid} />
        ) : (
          <EmptyState
            icon={<Plug className="size-5" aria-hidden />}
            title="Belum ada perangkat"
            hint="Tambahkan manual, atau hubungkan integrasi untuk menemukan perangkat yang sudah ada di jaringan."
            action={
              <Button size="sm" className="mt-2" onClick={onAddDevice}>
                Tambah perangkat
              </Button>
            }
          />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Ruang</CardTitle>
              <CardDescription>Kelompokkan perangkat per ruangan.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={onAddRoom}>
              <Blocks aria-hidden />
              Tambah
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {rooms.map((r) => (
              <Badge key={r.id} tone="neutral" className="px-2.5 py-1 text-xs">
                {r.name}
                {r._count?.devices != null && (
                  <span className="text-ink-subtle">{r._count.devices}</span>
                )}
              </Badge>
            ))}
            {!rooms.length && <p className="text-sm text-ink-subtle">Belum ada ruangan.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rutinitas</CardTitle>
            <CardDescription>
              Adegan untuk sekali jalan, otomasi untuk berjalan sendiri.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <JumpRow
              icon={<Sparkles aria-hidden />}
              label="Adegan"
              count={scenes.length}
              onClick={() => onGoTo('scenes')}
            />
            <JumpRow
              icon={<Wand2 aria-hidden />}
              label="Otomasi"
              count={automations.length}
              onClick={() => onGoTo('automations')}
            />
            <JumpRow
              icon={<Puzzle aria-hidden />}
              label="Integrasi"
              count={integrations.length}
              onClick={() => onGoTo('integrations')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JumpRow({
  icon,
  label,
  count,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
    >
      <span className="flex items-center gap-2">
        <span className="text-ink-subtle">{icon}</span>
        {label}
      </span>
      <span className="text-xs text-ink-subtle tabular-nums">{count}</span>
    </button>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: 'neutral' | 'positive';
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)]',
          tone === 'positive'
            ? 'bg-positive-soft text-positive'
            : 'bg-surface-sunken text-ink-subtle',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
        <p className="mt-1 truncate text-xs text-ink-muted">{label}</p>
      </div>
    </Card>
  );
}
