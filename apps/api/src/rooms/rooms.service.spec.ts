import { NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  home: { findFirst: vi.fn() },
  room: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
});

const homeRow = { id: 'home_1', ownerId: 'usr_1' };
const roomRow = { id: 'room_1', name: 'Kamar Tidur', homeId: 'home_1' };

describe('RoomsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: RoomsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    service = new RoomsService(prisma as unknown as PrismaService);
  });

  it('findAll tanpa homeId mengambil semua ruangan milik owner', async () => {
    prisma.room.findMany.mockResolvedValue([roomRow] as never);

    const res = await service.findAll('usr_1');

    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: { home: { ownerId: 'usr_1' } },
      include: { _count: { select: { devices: true } } },
    });
    expect(res).toEqual([roomRow]);
  });

  it('findAll dengan homeId memverifikasi kepemilikan home lebih dulu', async () => {
    prisma.home.findFirst.mockResolvedValue(homeRow as never);
    prisma.room.findMany.mockResolvedValue([roomRow] as never);

    const res = await service.findAll('usr_1', 'home_1');

    expect(prisma.home.findFirst).toHaveBeenCalledWith({
      where: { id: 'home_1', ownerId: 'usr_1' },
    });
    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: { homeId: 'home_1' },
      include: { _count: { select: { devices: true } } },
    });
    expect(res).toEqual([roomRow]);
  });

  it('findAll dengan homeId milik user lain melempar NotFoundException', async () => {
    prisma.home.findFirst.mockResolvedValue(null as never);

    await expect(service.findAll('usr_2', 'home_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.room.findMany).not.toHaveBeenCalled();
  });

  it('findOne mengembalikan ruangan beserta perangkatnya', async () => {
    prisma.room.findFirst.mockResolvedValue({
      ...roomRow,
      devices: [],
    } as never);

    const res = await service.findOne('usr_1', 'room_1');

    expect(prisma.room.findFirst).toHaveBeenCalledWith({
      where: { id: 'room_1', home: { ownerId: 'usr_1' } },
      include: { devices: true },
    });
    expect(res.devices).toEqual([]);
  });

  it('findOne melempar NotFoundException bila ruangan bukan miliknya', async () => {
    prisma.room.findFirst.mockResolvedValue(null as never);

    await expect(service.findOne('usr_2', 'room_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create memverifikasi home lalu menyimpan DTO apa adanya', async () => {
    prisma.home.findFirst.mockResolvedValue(homeRow as never);
    prisma.room.create.mockResolvedValue(roomRow as never);

    const res = await service.create('usr_1', {
      name: 'Kamar Tidur',
      homeId: 'home_1',
    });

    expect(prisma.room.create).toHaveBeenCalledWith({
      data: { name: 'Kamar Tidur', homeId: 'home_1' },
    });
    expect(res).toEqual(roomRow);
  });

  it('create melempar NotFoundException bila home bukan miliknya', async () => {
    prisma.home.findFirst.mockResolvedValue(null as never);

    await expect(
      service.create('usr_2', { name: 'Kamar Tidur', homeId: 'home_1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.room.create).not.toHaveBeenCalled();
  });

  it('update mengecek kepemilikan ruangan sebelum mengubah', async () => {
    prisma.room.findFirst.mockResolvedValue(roomRow as never);
    prisma.room.update.mockResolvedValue({ ...roomRow, name: 'Kamar Mandi' } as never);

    const res = await service.update('usr_1', 'room_1', { name: 'Kamar Mandi' });

    expect(prisma.room.findFirst).toHaveBeenCalledWith({
      where: { id: 'room_1', home: { ownerId: 'usr_1' } },
    });
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: 'room_1' },
      data: { name: 'Kamar Mandi' },
    });
    expect(res.name).toBe('Kamar Mandi');
  });

  it('update melempar NotFoundException bila ruangan bukan miliknya', async () => {
    prisma.room.findFirst.mockResolvedValue(null as never);

    await expect(
      service.update('usr_2', 'room_1', { name: 'Kamar Mandi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.room.update).not.toHaveBeenCalled();
  });

  it('remove menghapus ruangan yang dimiliki', async () => {
    prisma.room.findFirst.mockResolvedValue(roomRow as never);
    prisma.room.delete.mockResolvedValue(roomRow as never);

    await expect(service.remove('usr_1', 'room_1')).resolves.toEqual(roomRow);
    expect(prisma.room.delete).toHaveBeenCalledWith({ where: { id: 'room_1' } });
  });

  it('remove melempar NotFoundException bila ruangan bukan miliknya', async () => {
    prisma.room.findFirst.mockResolvedValue(null as never);

    await expect(service.remove('usr_2', 'room_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.room.delete).not.toHaveBeenCalled();
  });
});
