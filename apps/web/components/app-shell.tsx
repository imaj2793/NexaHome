'use client';

import {
  Activity,
  Blocks,
  LayoutDashboard,
  LogOut,
  Puzzle,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import NexaRobot from '@/components/nexa-robot';
import type { NexaState } from '@/lib/nexa';

/**
 * Bagian-bagian dashboard. Sidebar hanya mengubah konten yang tampil —
 * tidak ada route per bagian, jadi tidak ada biaya URL dan tidak perlu
 * memuat ulang data.
 */
export const SECTIONS = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'rooms', label: 'Ruang', icon: Blocks },
  { id: 'scenes', label: 'Adegan', icon: Sparkles },
  { id: 'automations', label: 'Otomasi', icon: Wand2 },
  { id: 'activity', label: 'Aktivitas', icon: Activity },
  { id: 'integrations', label: 'Integrasi', icon: Puzzle },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export interface SidebarProps {
  active: SectionId;
  onSelect: (section: SectionId) => void;
  user: { name?: string | null; email?: string } | null;
  nexaState: NexaState;
  onLogout: () => void;
}

export function Sidebar({
  active,
  onSelect,
  user,
  nexaState,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[17rem] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid size-9 place-items-center overflow-hidden rounded-[var(--radius-control)] bg-ink">
          <NexaRobot state={nexaState} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">NexaHome</p>
          <p className="truncate text-xs text-ink-subtle">Asisten rumah</p>
        </div>
      </div>

      <nav aria-label="Bagian dashboard" className="flex-1 space-y-0.5 px-3 py-2">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const current = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={current ? 'page' : undefined}
              onClick={() => onSelect(id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2',
                'text-sm transition-colors duration-150',
                current
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-xs font-semibold text-ink-muted">
            {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name ?? 'Pengguna'}</p>
            <p className="truncate text-xs text-ink-subtle">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={onLogout}>
          <LogOut aria-hidden />
          Keluar
        </Button>
      </div>
    </aside>
  );
}

/** Status koneksi realtime di topbar. */
export function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <Badge tone={connected ? 'positive' : 'neutral'}>
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', connected ? 'bg-positive' : 'bg-ink-subtle')}
      />
      {connected ? 'Terhubung' : 'Menyambung'}
    </Badge>
  );
}

export interface TopbarProps extends ComponentProps<'header'> {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions, className, ...props }: TopbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex flex-wrap items-center gap-3',
        'border-b border-line bg-canvas/85 px-6 py-4 backdrop-blur-md',
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
