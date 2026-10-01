import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tombol dengan beberapa varian.
 *
 * `asChild` dipakai saat elemennya harus tetap <a> atau <button> milik
 * pemanggil (mis. sebuah link) tapi tetap tampil seperti tombol.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-[var(--radius-control)] text-sm font-medium',
    'transition-colors duration-150',
    'disabled:pointer-events-none disabled:opacity-55',
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-ink hover:bg-accent-hover shadow-[var(--shadow-soft)]',
        outline:
          'bg-surface text-ink border border-line hover:bg-surface-muted hover:border-line-strong',
        ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        subtle:
          'bg-accent-soft text-accent hover:brightness-97 dark:brightness-105',
        danger:
          'bg-critical-soft text-critical hover:brightness-97 dark:brightness-105',
      },
      size: {
        sm: 'h-8 px-3 text-[0.8125rem]',
        md: 'h-9.5 px-4',
        lg: 'h-11 px-5 text-[0.9375rem]',
        icon: 'size-9.5 p-0',
        'icon-sm': 'size-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends Omit<ComponentProps<'button'>, 'color'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Menampilkan spinner dan menonaktifkan tombol. */
  loading?: boolean;
  /** Teks pengganti saat `loading` aktif; default-nya tetap `children`. */
  loadingText?: string;
}

export default function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {asChild ? null : (loadingText ?? children)}
        </>
      ) : (
        children
      )}
    </Component>
  );
}

export { Button, buttonVariants };
