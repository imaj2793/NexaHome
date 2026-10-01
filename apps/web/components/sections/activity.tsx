'use client';

import { Activity } from 'lucide-react';
import { EmptyState, SectionHeading } from '@/components/section-parts';
import { Card } from '@/components/ui/card';
import type { ApiActivityLog } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatActivityTime } from '@/lib/devices';

/** Jejak perubahan terakhir; level menentukan warna ikon dan label. */
export function ActivitySection({ logs }: { logs: ApiActivityLog[] }) {
  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Aktivitas"
        description="Jejak perubahan terakhir di rumah ini."
      />
      {logs.length ? (
        <Card>
          <ul>
            {logs.map((log, index) => (
              <li
                key={log.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                  index > 0 && 'border-t border-line',
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Activity
                    className={cn(
                      'size-4 shrink-0',
                      log.level === 'error'
                        ? 'text-critical'
                        : log.level === 'warn'
                          ? 'text-caution'
                          : 'text-ink-subtle',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block truncate">{log.message}</span>
                    {log.device && (
                      <span className="block truncate text-xs text-ink-subtle">
                        {log.device.name}
                      </span>
                    )}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
                  {formatActivityTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<Activity className="size-5" aria-hidden />}
          title="Belum ada aktivitas"
          hint="Perubahan perangkat dan adegan yang dijalankan akan muncul di sini."
        />
      )}
    </div>
  );
}
