import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-[0.8125rem] font-medium text-ink-muted',
        'peer-disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
