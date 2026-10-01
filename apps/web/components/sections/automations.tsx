'use client';

import { Wand2 } from 'lucide-react';
import { EmptyState, SectionHeading } from '@/components/section-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ApiAutomation } from '@/lib/api';

/** Otomasi: aturan yang berjalan sendiri, plus tombol uji manual. */
export function AutomationsSection({
  automations,
  onRun,
}: {
  automations: ApiAutomation[];
  onRun: (automation: ApiAutomation) => void;
}) {
  if (!automations.length) {
    return (
      <EmptyState
        icon={<Wand2 className="size-5" aria-hidden />}
        title="Belum ada otomasi"
        hint="Otomasi berjalan sendiri saat pemicunya terpenuhi, misalnya pada jam tertentu atau saat perangkat menyala."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Otomasi"
        description="Aturan yang berjalan otomatis. Jalankan manual untuk menguji sekarang."
      />
      <div className="flex flex-col gap-2">
        {automations.map((automation) => (
          <Card key={automation.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{automation.name}</p>
                  <Badge tone={automation.enabled ? 'positive' : 'neutral'}>
                    {automation.enabled ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {automation.triggers
                    .map((t) => (t.config as { time?: string }).time ?? t.type)
                    .join(', ')}
                  {' · '}
                  {automation.actions.length} aksi
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onRun(automation)}>
                Jalankan
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
