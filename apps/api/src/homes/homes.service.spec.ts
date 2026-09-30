import { ApiError } from '../common/errors/api-error';
import { HomesService } from './homes.service';
import { accessibleHomeFilter } from './home-access';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  home: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
});

const homeRow = {
  id: 'home_1',
  name: 'Rumah Utama',
  ownerId: 'usr_1',
};

describe('HomesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HomesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    service = new HomesService(prisma as unknown as PrismaService);
  });

  it('findAll hanya memfilter home milik owner', async () => {
    prisma.home.findMany.mockResolvedValue([homeRow] as never);

    const res = await service.findAll('usr_1');

    expect(prisma.home.findMany).toHaveBeenCalledWith({
      where: accessibleHomeFilter('usr_1'),
      include: {
        _count: { select: { rooms: true, devices: true } },
        members: { select: { userId: true, role: true } },
      },
    });
    expect(res).toEqual([homeRow]);
  });

  it('findOne mengembalikan home lengkap dengan relasinya', async () => {
    prisma.home.findFirst.mockResolvedValue({
      ...homeRow,
      rooms: [],
      devices: [],
      integrations: [],
    } as never);

    const res = await service.findOne('usr_1', 'home_1');

    expect(prisma.home.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'home_1',
        OR: [{ ownerId: 'usr_1' }, { members: { some: { userId: 'usr_1' } } }],
      },
      include: { rooms: true, devices: true, integrations: true },
    });
    expect(res.rooms).toEqual([]);
  });

  it('findOne melempar NotFoundException bila home milik user lain', async () => {
    prisma.home.findFirst.mockResolvedValue(null as never);

    await expect(service.findOne('usr_2', 'home_1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('create menyimpan ownerId dari argumen, bukan dari DTO', async () => {
    prisma.home.create.mockResolvedValue(homeRow as never);

    const res = await service.create('usr_1', { name: 'Rumah Utama' });

    expect(prisma.home.create).toHaveBeenCalledWith({
      data: { name: 'Rumah Utama', ownerId: 'usr_1' },
    });
    expect(res).toEqual(homeRow);
  });

  it('update mengecek kepemilikan sebelum mengubah', async () => {
    prisma.home.findFirst.mockResolvedValue(homeRow as never);
    prisma.home.update.mockResolvedValue({ ...homeRow, name: 'Rumah Baru' } as never);

    const res = await service.update('usr_1', 'home_1', { name: 'Rumah Baru' });

    expect(prisma.home.findFirst).toHaveBeenCalledWith({
      where: { id: 'home_1', ownerId: 'usr_1' },
    });
    expect(prisma.home.update).toHaveBeenCalledWith({
      where: { id: 'home_1' },
      data: { name: 'Rumah Baru' },
    });
    expect(res.name).toBe('Rumah Baru');
  });

  it('update tidak menyentuh DB bila home tidak dimiliki', async () => {
    prisma.home.findFirst.mockResolvedValue(null as never);

    await expect(
      service.update('usr_2', 'home_1', { name: 'Rumah Baru' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.home.update).not.toHaveBeenCalled();
  });

  it('remove menghapus home yang dimiliki', async () => {
    prisma.home.findFirst.mockResolvedValue(homeRow as never);
    prisma.home.delete.mockResolvedValue(homeRow as never);

    await expect(service.remove('usr_1', 'home_1')).resolves.toEqual(homeRow);
    expect(prisma.home.delete).toHaveBeenCalledWith({ where: { id: 'home_1' } });
  });

  it('remove melempar NotFoundException bila home bukan miliknya', async () => {
    prisma.home.findFirst.mockResolvedValue(null as never);

    await expect(service.remove('usr_2', 'home_1')).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(prisma.home.delete).not.toHaveBeenCalled();
  });
});
