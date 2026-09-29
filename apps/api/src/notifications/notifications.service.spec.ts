import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  notification: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
});

const notificationRow = {
  id: 'notif_1',
  userId: 'usr_1',
  title: 'Perangkat offline',
  body: 'Lampu Meja tidak merespons.',
  read: false,
};

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: NotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it('list hanya mengambil notifikasi milik user dan urut terbaru', async () => {
    prisma.notification.findMany.mockResolvedValue([notificationRow] as never);

    const res = await service.list('usr_1');

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'usr_1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(res).toEqual([notificationRow]);
  });

  it('markRead menandai notifikasi sebagai dibaca', async () => {
    prisma.notification.findFirst.mockResolvedValue(notificationRow as never);
    prisma.notification.update.mockResolvedValue({
      ...notificationRow,
      read: true,
    } as never);

    const res = await service.markRead('usr_1', 'notif_1');

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'notif_1', userId: 'usr_1' },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif_1' },
      data: { read: true },
    });
    expect(res.read).toBe(true);
  });

  it('markRead melempar NotFoundException untuk notifikasi user lain', async () => {
    prisma.notification.findFirst.mockResolvedValue(null as never);

    await expect(service.markRead('usr_2', 'notif_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('markAllRead hanya menyentuh notifikasi yang belum dibaca', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 } as never);

    const res = await service.markAllRead('usr_1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'usr_1', read: false },
      data: { read: true },
    });
    expect(res).toEqual({ count: 3 });
  });

  it('remove menghapus notifikasi milik user', async () => {
    prisma.notification.findFirst.mockResolvedValue(notificationRow as never);
    prisma.notification.delete.mockResolvedValue(notificationRow as never);

    await expect(service.remove('usr_1', 'notif_1')).resolves.toEqual(
      notificationRow,
    );
    expect(prisma.notification.delete).toHaveBeenCalledWith({
      where: { id: 'notif_1' },
    });
  });

  it('remove melempar NotFoundException untuk notifikasi user lain', async () => {
    prisma.notification.findFirst.mockResolvedValue(null as never);

    await expect(service.remove('usr_2', 'notif_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.notification.delete).not.toHaveBeenCalled();
  });

  it('notify membuat notifikasi tanpa body', async () => {
    prisma.notification.create.mockResolvedValue(notificationRow as never);

    await service.notify('usr_1', 'Perangkat offline');

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'usr_1', title: 'Perangkat offline', body: undefined },
    });
  });

  it('notify menyertakan body bila diberikan', async () => {
    prisma.notification.create.mockResolvedValue(notificationRow as never);

    await service.notify('usr_1', 'Perangkat offline', 'Tidak merespons.');

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'usr_1',
        title: 'Perangkat offline',
        body: 'Tidak merespons.',
      },
    });
  });
});
