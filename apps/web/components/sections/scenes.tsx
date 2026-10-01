'use client';

import { Sparkles } from 'lucide-react';
import { EmptyState, SectionHeading } from '@/components/section-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ApiScene } from '@/lib/api';

/** Adegan: satu klik menjalankan beberapa aksi sekaligus. */
export function ScenesSection({
  scenes,
  busyScene,
  onActivate,
}: {
  scenes: ApiScene[];
  busyScene: string | null;
  onActivate: (scene: ApiScene) => void;
}) {
  if (!scenes.length) {
    return (
      <EmptyState
        icon={<Sparkles className="size-5" aria-hidden />}
        title="Belum ada adegan"
        hint="Adegan menjalankan beberapa aksi sekaligus, misalnya menyalakan lampu dan AC sekaligus untuk suasana malam."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Adegan"
        description="Jalankan semua aksi dalam adegan dengan satu klik."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {scenes.map((scene) => (
          <Card key={scene.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-accent-soft text-accent">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{scene.name}</p>
                <p className="text-xs text-ink-muted">
                  {scene.actions.length} aksi
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                loading={busyScene === scene.id}
                onClick={() => onActivate(scene)}
              >
                Jalankan
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
