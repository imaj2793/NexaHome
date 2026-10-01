'use client';

import { Blocks } from 'lucide-react';
import { DeviceGrid, type DeviceGridProps } from '@/components/device-grid';
import { EmptyState, SectionHeading } from '@/components/section-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ApiRoom } from '@/lib/api';
import { deviceStatus } from '@/lib/devices';

export interface RoomsProps extends DeviceGridProps {
  rooms: ApiRoom[];
  addingRoom: boolean;
  newRoomName: string;
  onNewRoomName: (value: string) => void;
  onSubmitRoom: () => void;
  onCancelRoom: () => void;
  onStartRoom: () => void;
  onAddDevice: () => void;
}

/** Perangkat dikelompokkan per ruangan, plus perangkat yang belum punya ruangan. */
export function RoomsSection({
  rooms,
  devices,
  addingRoom,
  newRoomName,
  onNewRoomName,
  onSubmitRoom,
  onCancelRoom,
  onStartRoom,
  onAddDevice,
  ...grid
}: RoomsProps) {
  if (!rooms.length) {
    return (
      <EmptyState
        icon={<Blocks className="size-5" aria-hidden />}
        title="Belum ada ruangan"
        hint="Buat ruangan dulu supaya perangkat lebih mudah dicari, misalnya Teras atau Kamar Tidur."
        action={
          <Button size="sm" className="mt-2" onClick={onStartRoom}>
            <Blocks aria-hidden />
            Tambah ruangan
          </Button>
        }
      />
    );
  }

  const loose = devices.filter((d) => !d.roomId);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="Ruang"
        description="Tiap ruangan menampilkan perangkatnya sendiri."
        action={
          <Button size="sm" variant="outline" onClick={onStartRoom}>
            <Blocks aria-hidden />
            Ruangan baru
          </Button>
        }
      />

      {addingRoom && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitRoom();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-48 flex-1">
            <label htmlFor="new-room" className="mb-1 block text-xs text-ink-muted">
              Nama ruangan
            </label>
            <Input
              id="new-room"
              autoFocus
              value={newRoomName}
              placeholder="Kamar Tidur"
              onChange={(e) => onNewRoomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelRoom();
              }}
            />
          </div>
          <Button type="submit" variant="primary" disabled={!newRoomName.trim()}>
            Simpan
          </Button>
          <Button type="button" variant="ghost" onClick={onCancelRoom}>
            Batal
          </Button>
        </form>
      )}

      {rooms.map((room) => {
        const roomDevices = devices.filter((d) => d.room?.id === room.id);
        const on = roomDevices.filter((d) => deviceStatus(d) === 'on').length;
        return (
          <Card key={room.id}>
            <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
              <div>
                <CardTitle>{room.name}</CardTitle>
                <CardDescription>
                  {roomDevices.length} perangkat · {on} menyala
                </CardDescription>
              </div>
              <Badge tone={on ? 'positive' : 'neutral'}>{on ? 'Aktif' : 'Idle'}</Badge>
            </CardHeader>
            <CardContent>
              {roomDevices.length ? (
                <DeviceGrid devices={roomDevices} {...grid} />
              ) : (
                <p className="text-sm text-ink-subtle">
                  Belum ada perangkat di ruangan ini.{' '}
                  <button
                    type="button"
                    onClick={onAddDevice}
                    className="font-medium text-accent hover:underline"
                  >
                    Tambahkan
                  </button>
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {loose.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Belum masuk ruangan</CardTitle>
            <CardDescription>Perangkat ini belum punya ruangan.</CardDescription>
          </CardHeader>
          <CardContent>
            <DeviceGrid devices={loose} {...grid} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
