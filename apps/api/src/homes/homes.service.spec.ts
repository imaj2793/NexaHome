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
  homeMember: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
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

describe('HomesService — anggota rumah', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HomesService;

  const memberRow = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'mem_1',
    homeId: 'home_1',
    userId: 'usr_2',
    role: 'USER',
    createdAt: new Date('2026-01-01'),
    user: { id: 'usr_2', email: 'anggota@x.local', name: 'Anggota' },
    ...over,
  });

  const OWNER = 'usr_1';
  const MEMBER = 'usr_2';

  /**
   * Mock yang tidak buta, bukan sekadar "kembalikan home atau null".
   * `ensureOwned` (owner-only) dan `assertAccessible` (owner ATAU anggota)
   * memanggil Prisma yang sama dengan argumen berbeda — kalau mock-nya buta,
   * test akan tetap hijau meski salah satunya jadi lebih longgar.
   */
  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    service = new HomesService(prisma as unknown as PrismaService);

    prisma.home.findFirst.mockImplementation(async (args: unknown) => {
      interface WhereClause {
        ownerId?: string;
        members?: { some: { userId?: string } };
      }
      const where = (args as { where: WhereClause & { OR?: WhereClause[] } })
        .where;

      // Query owner-only (ensureOwned): hanya OWNER yang cocok.
      if (where.ownerId !== undefined) {
        return where.ownerId === OWNER ? homeRow : null;
      }

      // Query "owner atau anggota": cocok kalau user ada di salah satu clause.
      const known = (id?: string) =>
        id !== undefined && (id === OWNER || id === MEMBER);
      const allowed = (where.OR ?? []).some(
        (clause) =>
          known(clause.ownerId) || known(clause.members?.some?.userId),
      );
      return allowed ? homeRow : null;
    });

    prisma.homeMember.findMany.mockResolvedValue([memberRow()] as never);
  });

  describe('listMembers', () => {
    it('mengembalikan email dan nama, tanpa field user sensitif', async () => {
      const res = await service.listMembers('usr_1', 'home_1');

      expect(res).toEqual([
        {
          id: 'mem_1',
          userId: 'usr_2',
          email: 'anggota@x.local',
          name: 'Anggota',
          role: 'USER',
          createdAt: new Date('2026-01-01'),
        },
      ]);
      // Tidak boleh membocorkan hash password atau field user lain.
      expect(JSON.stringify(res)).not.toContain('passwordHash');
    });

    it('bisa dipanggil anggota rumah, bukan hanya owner', async () => {
      await expect(service.listMembers(MEMBER, 'home_1')).resolves.toHaveLength(1);
    });

    it('menolak user yang bukan anggota dengan NOT_FOUND', async () => {
      // usr_3 bukan owner maupun anggota — mock mengembalikan null.
      await expect(service.listMembers('usr_3', 'home_1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(prisma.homeMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('addMember', () => {
    it('menambah anggota lalu mengembalikan daftar terbaru', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_2',
        email: 'anggota@x.local',
        name: 'Anggota',
      } as never);
      prisma.homeMember.findUnique.mockResolvedValue(null as never);

      const res = await service.addMember('usr_1', 'home_1', 'Anggota@X.Local');

      // Email dinormalisasi sebelum dicari.
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'anggota@x.local' },
        select: { id: true, email: true, name: true },
      });
      expect(prisma.homeMember.create).toHaveBeenCalledWith({
        data: { homeId: 'home_1', userId: 'usr_2' },
      });
      expect(res).toHaveLength(1);
    });

    it('HANYA owner yang boleh menambah anggota', async () => {
      // MEMBER punya akses ke home ini lewat keanggotaan, jadi filter
      // "owner atau anggota" akan LOLOS di sini — test ini menangkapnya.
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_9',
        email: 'baru@x.local',
        name: 'Baru',
      } as never);
      prisma.homeMember.findUnique.mockResolvedValue(null as never);

      await expect(
        service.addMember(MEMBER, 'home_1', 'baru@x.local'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(prisma.homeMember.create).not.toHaveBeenCalled();
    });

    it('idempoten: anggota yang sudah ada tidak digandakan', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_2',
        email: 'anggota@x.local',
        name: 'Anggota',
      } as never);
      prisma.homeMember.findUnique.mockResolvedValue({ id: 'mem_1' } as never);

      const res = await service.addMember('usr_1', 'home_1', 'anggota@x.local');

      expect(prisma.homeMember.create).not.toHaveBeenCalled();
      expect(res).toHaveLength(1);
    });

    it('menolak email yang tidak terdaftar', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      await expect(
        service.addMember('usr_1', 'home_1', 'hantu@x.local'),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(prisma.homeMember.create).not.toHaveBeenCalled();
    });

    it('menolak owner mencoba menambah dirinya sendiri', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'owner@x.local',
        name: 'Owner',
      } as never);

      await expect(
        service.addMember('usr_1', 'home_1', 'owner@x.local'),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(prisma.homeMember.create).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('HANYA owner yang boleh mengeluarkan anggota', async () => {
      await expect(
        service.removeMember(MEMBER, 'home_1', 'mem_1'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(prisma.homeMember.delete).not.toHaveBeenCalled();
    });

    it('membatasi delete pada homeId yang diminta', async () => {
      await service.removeMember('usr_1', 'home_1', 'mem_1');

      // Tanpa homeId, anggota dari rumah lain bisa ikut terhapus.
      expect(prisma.homeMember.delete).toHaveBeenCalledWith({
        where: { id: 'mem_1', homeId: 'home_1' },
      });
    });
  });
});
