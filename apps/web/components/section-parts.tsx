'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Placeholder seragam untuk daftar yang masih kosong. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-sunken text-ink-subtle">
        {icon}
      </span>
      <p className="mt-1 text-sm font-medium">{title}</p>
      {hint && <p className="max-w-md text-sm text-ink-muted">{hint}</p>}
      {action}
    </div>
  );
}

/** Judul bagian + keterangan + aksi di kanan. */
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3')}>
      <div>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
