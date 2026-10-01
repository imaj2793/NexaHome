'use client';

import { Puzzle, ShieldAlert } from 'lucide-react';
import { EmptyState, SectionHeading } from '@/components/section-parts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ApiIntegration } from '@/lib/api';

/**
 * Integrasi hanya menampilkan metadata dan status enkripsi kredensial.
 *
 * Nilai `config` sudah disamarkan server, jadi tidak ada yang ditampilkan
 * di sini — cukup status agar pengguna tahu bridge-nya sehat atau belum.
 */
export function IntegrationsSection({
  integrations,
}: {
  integrations: ApiIntegration[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Integrasi"
        description="Bridge ke perangkat di jaringanmu. Nilai kredensial tidak pernah dikirim ke browser."
      />
      {integrations.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-surface-sunken text-ink-subtle">
                  <Puzzle className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{integration.name}</p>
                  <p className="text-xs text-ink-muted">{integration.type}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={integration.enabled ? 'positive' : 'neutral'}>
                    {integration.enabled ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                  {!integration.credentialsEncrypted && (
                    <Badge tone="caution" className="font-normal">
                      <ShieldAlert aria-hidden />
                      Simpan ulang kredensial
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Puzzle className="size-5" aria-hidden />}
          title="Belum ada integrasi"
          hint="Tambahkan perangkat secara manual, atau hubungkan bridge MQTT, Tasmota, atau Shelly untuk menemukan perangkat yang sudah ada di jaringan."
        />
      )}
    </div>
  );
}
