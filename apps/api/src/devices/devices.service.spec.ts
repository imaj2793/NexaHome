import { accessibleHomeFilter, accessibleHomeWhere } from '../homes/home-access';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import type { DeviceCoreService } from '../device-core/device-core.service';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  home: { findFirst: vi.fn() },
  device: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
});

const makeDeviceCore = () => ({
  executeCommand: vi.fn(),
});

const homeRow = accessibleHomeWhere('usr_1', 'home_1');
const deviceRow = {
  id: 'dev_1',
  name: 'Lampu Meja',
  type: 'light',
  homeId: 'home_1',
  roomId: 'room_1',
  integrationId: null,
  externalId: null,
  state: { power: false },
};

const commandResult = {
  deviceId: 'dev_1',
  state: { power: true },
  message: 'Lampu Meja dinyalakan.',
  external: false,
};

describe('DevicesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let deviceCore: ReturnType<typeof makeDeviceCore>;
  let service: DevicesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    deviceCore = makeDeviceCore();
    service = new DevicesService(
      prisma as unknown as PrismaService,
      deviceCore as unknown as DeviceCoreService,
    );
  });

  describe('findAll', () => {
    it('mengambil seluruh perangkat milik owner tanpa filter home', async () => {
      prisma.device.findMany.mockResolvedValue([deviceRow] as never);

      const res = await service.findAll('usr_1');

      expect(prisma.home.findFirst).not.toHaveBeenCalled();
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { home: accessibleHomeFilter('usr_1') },
        include: { room: true, integration: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(res).toEqual([deviceRow]);
    });

    it('menyertakan rumah yang dianggotai, bukan hanya milik sendiri', async () => {
    // Otorisasi memakai filter keanggotaan, jadi anggota non-owner tetap bisa
    // membaca devices rumah itu.
    await service.findAll('usr_member');

    const [args] = prisma.device.findMany.mock.calls[0];
    expect(args.where.home).toEqual({
      OR: [
        { ownerId: 'usr_member' },
        { members: { some: { userId: 'usr_member' } } },
      ],
    });
  });

  it('memverifikasi kepemilikan home saat homeId diberikan', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.device.findMany.mockResolvedValue([] as never);

      await service.findAll('usr_1', 'home_1');

      expect(prisma.home.findFirst).toHaveBeenCalledWith({
        where: accessibleHomeWhere('usr_1', 'home_1'),
      });
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { home: accessibleHomeFilter('usr_1'), homeId: 'home_1' },
        include: { room: true, integration: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('menambahkan roomId ke filter bila diberikan', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.device.findMany.mockResolvedValue([] as never);

      await service.findAll('usr_1', 'home_1', 'room_1');

      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: {
          home: accessibleHomeFilter('usr_1'),
          homeId: 'home_1',
          roomId: 'room_1',
        },
        include: { room: true, integration: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('melempar NotFoundException bila home bukan miliknya', async () => {
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(service.findAll('usr_2', 'home_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.device.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('mengembalikan perangkat beserta room dan integration', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);

      const res = await service.findOne('usr_1', 'dev_1');

      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'dev_1', home: accessibleHomeFilter('usr_1') },
        include: { room: true, integration: true },
      });
      expect(res.id).toBe('dev_1');
    });

    it('melempar NotFoundException bila perangkat bukan miliknya', async () => {
      prisma.device.findFirst.mockResolvedValue(null as never);

      await expect(service.findOne('usr_2', 'dev_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('mengisi default null dan array kosong untuk field opsional', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.device.create.mockResolvedValue(deviceRow as never);

      await service.create('usr_1', {
        name: 'Lampu Meja',
        type: 'light',
        homeId: 'home_1',
      });

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: {
          name: 'Lampu Meja',
          type: 'light',
          homeId: 'home_1',
          roomId: null,
          integrationId: null,
          externalId: null,
          capabilities: [],
          state: {},
        },
      });
    });

    it('menyalakan seluruh field opsional saat diisi', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.device.create.mockResolvedValue(deviceRow as never);

      await service.create('usr_1', {
        name: 'Lampu Meja',
        type: 'light',
        homeId: 'home_1',
        roomId: 'room_1',
        integrationId: 'int_1',
        externalId: 'ext-1',
        capabilities: ['power', 'brightness'],
        state: { power: true },
      });

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: {
          name: 'Lampu Meja',
          type: 'light',
          homeId: 'home_1',
          roomId: 'room_1',
          integrationId: 'int_1',
          externalId: 'ext-1',
          capabilities: ['power', 'brightness'],
          state: { power: true },
        },
      });
    });

    it('melempar NotFoundException bila home bukan miliknya', async () => {
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(
        service.create('usr_2', {
          name: 'Lampu Meja',
          type: 'light',
          homeId: 'home_1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.device.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('hanya memasukkan field yang dikirim', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      prisma.device.update.mockResolvedValue(deviceRow as never);

      await service.update('usr_1', 'dev_1', { name: 'Lampu Kursi' });

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'dev_1' },
        data: { name: 'Lampu Kursi' },
      });
    });

    it('membolehkan roomId null untuk melepas ruangan', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      prisma.device.update.mockResolvedValue({ ...deviceRow, roomId: null } as never);

      const res = await service.update('usr_1', 'dev_1', { roomId: null });

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'dev_1' },
        data: { roomId: null },
      });
      expect(res.roomId).toBeNull();
    });

    it('melempar NotFoundException bila perangkat bukan miliknya', async () => {
      prisma.device.findFirst.mockResolvedValue(null as never);

      await expect(
        service.update('usr_2', 'dev_1', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.device.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('menghapus perangkat yang dimiliki', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      prisma.device.delete.mockResolvedValue(deviceRow as never);

      await expect(service.remove('usr_1', 'dev_1')).resolves.toEqual(deviceRow);
      expect(prisma.device.delete).toHaveBeenCalledWith({ where: { id: 'dev_1' } });
    });

    it('melempar NotFoundException bila perangkat bukan miliknya', async () => {
      prisma.device.findFirst.mockResolvedValue(null as never);

      await expect(service.remove('usr_2', 'dev_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.device.delete).not.toHaveBeenCalled();
    });
  });

  describe('command', () => {
    it('menolak action di luar whitelist', async () => {
      await expect(
        service.command('usr_1', 'dev_1', { action: 'reboot' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.device.findFirst).not.toHaveBeenCalled();
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('meneruskan command yang valid ke DeviceCoreService', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      deviceCore.executeCommand.mockResolvedValue(commandResult as never);

      const res = await service.command('usr_1', 'dev_1', {
        action: 'turn_on',
      });

      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'dev_1', home: accessibleHomeFilter('usr_1') },
        include: { integration: true },
      });
      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        deviceRow,
        'turn_on',
        undefined,
      );
      expect(res).toEqual(commandResult);
    });

    it('meneruskan value untuk set_brightness', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      deviceCore.executeCommand.mockResolvedValue(commandResult as never);

      await service.command('usr_1', 'dev_1', {
        action: 'set_brightness',
        value: 60,
      });

      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        deviceRow,
        'set_brightness',
        60,
      );
    });

    it('menerima seluruh action yang ada di whitelist', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      deviceCore.executeCommand.mockResolvedValue(commandResult as never);

      for (const action of [
        'turn_on',
        'turn_off',
        'set_brightness',
        'set_color',
        'set_temperature',
      ]) {
        await expect(
          service.command('usr_1', 'dev_1', { action }),
        ).resolves.toEqual(commandResult);
      }
      expect(deviceCore.executeCommand).toHaveBeenCalledTimes(5);
    });

    it('melempar NotFoundException bila perangkat bukan miliknya', async () => {
      prisma.device.findFirst.mockResolvedValue(null as never);

      await expect(
        service.command('usr_2', 'dev_1', { action: 'turn_on' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('meneruskan error dari DeviceCoreService ke pemanggil', async () => {
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      deviceCore.executeCommand.mockRejectedValue(
        new Error('integration gagal'),
      );

      await expect(
        service.command('usr_1', 'dev_1', { action: 'turn_on' }),
      ).rejects.toThrow('integration gagal');
    });
  });
});
