import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const fieldBase = [
  'w-full rounded-[var(--radius-control)] border border-line bg-surface',
  'px-3 text-sm text-ink placeholder:text-ink-subtle',
  'transition-colors duration-150',
  'hover:border-line-strong',
  'focus-visible:border-accent focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-accent/25',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
  'aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical/20',
].join(' ');

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      // type ada default-nya supaya input tanpa type tidak jadi text terbuka
      // di browser dan styling-nya tetap sama.
      type={type ?? 'text'}
      className={cn(fieldBase, 'h-9.5', className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(fieldBase, 'min-h-20 py-2 leading-relaxed', className)}
      {...props}
    />
  );
}
