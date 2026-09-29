import { NotFoundException } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  home: { findFirst: vi.fn() },
  activityLog: { findMany: vi.fn() },
});

const homeRow = { id: 'home_1', ownerId: 'usr_1' };
const logRow = {
  id: 'log_1',
  homeId: 'home_1',
  deviceId: 'dev_1',
  level: 'INFO',
  message: 'Lampu Meja dinyalakan.',
};

describe('ActivityLogService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ActivityLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    service = new ActivityLogService(prisma as unknown as PrismaService);
  });

  it('findAll tanpa homeId mengambil log seluruh home milik owner', async () => {
    prisma.activityLog.findMany.mockResolvedValue([logRow] as never);

    const res = await service.findAll('usr_1');

    expect(prisma.home.findFirst).not.toHaveBeenCalled();
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
      where: { home: { ownerId: 'usr_1' } },
      include: { device: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(res).toEqual([logRow]);
  });

  it('findAll dengan homeId memverifikasi kepemilikan home', async () => {
    prisma.home.findFirst.mockResolvedValue(homeRow as never);
    prisma.activityLog.findMany.mockResolvedValue([] as never);

    await service.findAll('usr_1', 'home_1');

    expect(prisma.home.findFirst).toHaveBeenCalledWith({
      where: { id: 'home_1', ownerId: 'usr_1' },
    });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
      where: { home: { ownerId: 'usr_1' }, homeId: 'home_1' },
      include: { device: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('findAll dengan homeId milik user lain melempar NotFoundException', async () => {
    prisma.home.findFirst.mockResolvedValue(null as never);

    await expect(service.findAll('usr_2', 'home_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.activityLog.findMany).not.toHaveBeenCalled();
  });

  it('menghormati limit yang diberikan', async () => {
    prisma.activityLog.findMany.mockResolvedValue([] as never);

    await service.findAll('usr_1', undefined, 10);

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it('menjepit limit di rentang 1 sampai 200', async () => {
    prisma.activityLog.findMany.mockResolvedValue([] as never);

    await service.findAll('usr_1', undefined, 0);
    expect(prisma.activityLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 }),
    );

    await service.findAll('usr_1', undefined, -5);
    expect(prisma.activityLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 }),
    );

    await service.findAll('usr_1', undefined, 5000);
    expect(prisma.activityLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 200 }),
    );

    await service.findAll('usr_1', undefined, 200);
    expect(prisma.activityLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it('menyertakan ringkasan perangkat pada relasi device', async () => {
    prisma.activityLog.findMany.mockResolvedValue([] as never);

    await service.findAll('usr_1');

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { device: { select: { id: true, name: true } } },
      }),
    );
  });
});
