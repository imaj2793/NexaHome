import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const makePrisma = () => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  refreshToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
});

const makeJwt = () => ({ signAsync: vi.fn().mockResolvedValue('access.jwt.token') });

const makeConfig = (days: unknown = '7') => ({
  get: vi.fn().mockReturnValue(days),
});

const userRow = {
  id: 'usr_1',
  email: 'budi@nexahome.test',
  name: 'Budi',
  role: 'USER',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
};

describe('AuthService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let jwt: ReturnType<typeof makeJwt>;
  let config: ReturnType<typeof makeConfig>;
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    jwt = makeJwt();
    config = makeConfig();
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('register', () => {
    it('menolak email yang sudah terdaftar', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow as never);

      await expect(
        service.register({ email: userRow.email, password: 'rahasia123' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('membuat user, menandatangani JWT, dan menyimpan hash refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);
      prisma.user.create.mockResolvedValue(userRow as never);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const res = await service.register({
        email: userRow.email,
        password: 'rahasia123',
        name: 'Budi',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userRow.email,
          passwordHash: expect.any(String),
          name: 'Budi',
        },
      });

      const created = prisma.user.create.mock.calls[0][0] as unknown as {
        data: { passwordHash: string };
      };
      expect(created.data.passwordHash).not.toBe('rahasia123');
      await expect(
        bcrypt.compare('rahasia123', created.data.passwordHash),
      ).resolves.toBe(true);

      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: userRow.id,
        email: userRow.email,
        role: 'USER',
      });

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: userRow.id,
          tokenHash: hashToken(res.refreshToken),
          expiresAt: expect.any(Date),
        },
      });

      expect(res.user).toEqual({
        id: userRow.id,
        email: userRow.email,
        name: 'Budi',
        role: 'USER',
        createdAt: '2026-01-02T03:04:05.000Z',
      });
      expect(res.accessToken).toBe('access.jwt.token');
    });

    it('menyimpan name null bila tidak diisi', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);
      prisma.user.create.mockResolvedValue({ ...userRow, name: null } as never);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const res = await service.register({
        email: 'anon@nexahome.test',
        password: 'rahasia123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'anon@nexahome.test', passwordHash: expect.any(String), name: null },
      });
      expect(res.user.name).toBeNull();
    });
  });

  describe('login', () => {
    it('menolak email yang tidak terdaftar', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      await expect(
        service.login({ email: 'salah@nexahome.test', password: 'rahasia123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('menolak password yang salah', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userRow,
        passwordHash: bcrypt.hashSync('rahasia123', 4),
      } as never);

      await expect(
        service.login({ email: userRow.email, password: 'password-keliru' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('berhasil login dan menerbitkan sepasang token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userRow,
        passwordHash: bcrypt.hashSync('rahasia123', 4),
      } as never);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const res = await service.login({
        email: userRow.email,
        password: 'rahasia123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userRow.email },
      });
      expect(res.accessToken).toBe('access.jwt.token');
      expect(res.refreshToken).toEqual(expect.any(String));
      expect(res.user.id).toBe(userRow.id);
    });
  });

  describe('refresh', () => {
    it('menolak refresh token yang tidak dikenal', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null as never);

      await expect(service.refresh('token-asing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('menolak refresh token yang sudah dicabut', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        user: userRow,
      } as never);

      await expect(service.refresh('token-lama')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('menolak refresh token yang kedaluwarsa', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: userRow,
      } as never);

      await expect(service.refresh('token-kedaluwarsa')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('merotasi token: mencabut yang lama lalu menerbitkan sesi baru', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: userRow,
      } as never);
      prisma.refreshToken.update.mockResolvedValue({} as never);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const res = await service.refresh('token-valid');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('token-valid') },
        include: { user: true },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt_1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: userRow.id,
          tokenHash: hashToken(res.refreshToken),
          expiresAt: expect.any(Date),
        },
      });
      expect(res.accessToken).toBe('access.jwt.token');
    });
  });

  describe('logout', () => {
    it('mencabut token yang belum dicabut secara idempoten', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as never);

      await expect(service.logout('token-a')).resolves.toEqual({
        success: true,
      });
      await expect(service.logout('token-a')).resolves.toEqual({
        success: true,
      });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('token-a'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('issueRefreshToken', () => {
    it('memakai TTL dari konfigurasi', async () => {
      config = makeConfig('3');
      service = new AuthService(
        prisma as unknown as PrismaService,
        jwt as unknown as JwtService,
        config as unknown as ConfigService,
      );
      prisma.user.findUnique.mockResolvedValue(null as never);
      prisma.user.create.mockResolvedValue(userRow as never);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const before = Date.now();
      await service.register({
        email: userRow.email,
        password: 'rahasia123',
      });

      const call = prisma.refreshToken.create.mock.calls[0][0] as unknown as {
        data: { expiresAt: Date };
      };
      const ttlDays =
        (call.data.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(ttlDays).toBeGreaterThan(2.9);
      expect(ttlDays).toBeLessThan(3.1);
    });

    it('fallback ke 30 hari saat konfigurasi tidak valid', async () => {
      config = makeConfig('tidak-angka');
      service = new AuthService(
        prisma as unknown as PrismaService,
        jwt as unknown as JwtService,
        config as unknown as ConfigService,
      );
      prisma.user.findUnique.mockResolvedValue(null as never);
      prisma.user.create.mockResolvedValue(userRow as never);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const before = Date.now();
      await service.register({
        email: userRow.email,
        password: 'rahasia123',
      });

      const call = prisma.refreshToken.create.mock.calls[0][0] as unknown as {
        data: { expiresAt: Date };
      };
      const ttlDays =
        (call.data.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(ttlDays).toBeGreaterThan(29.9);
      expect(ttlDays).toBeLessThan(30.1);
    });
  });
});
