import { accessibleHomeFilter, accessibleHomeWhere } from '../homes/home-access';
import { NotFoundException } from '@nestjs/common';
import { ScenesService } from './scenes.service';
import type { DeviceCoreService } from '../device-core/device-core.service';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  home: { findFirst: vi.fn() },
  scene: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  device: { findFirst: vi.fn() },
});

const makeDeviceCore = () => ({ executeCommand: vi.fn() });

const homeRow = accessibleHomeWhere('usr_1', 'home_1');
const sceneRow = {
  id: 'scene_1',
  name: 'Mode Malam',
  homeId: 'home_1',
  actions: [{ id: 'sa_1', deviceId: 'dev_1', action: { action: 'turn_on' } }],
};
const deviceRow = {
  id: 'dev_1',
  name: 'Lampu Meja',
  homeId: 'home_1',
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

describe('ScenesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let deviceCore: ReturnType<typeof makeDeviceCore>;
  let service: ScenesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    deviceCore = makeDeviceCore();
    service = new ScenesService(
      prisma as unknown as PrismaService,
      deviceCore as unknown as DeviceCoreService,
    );
  });

  describe('list', () => {
    it('mengambil semua scene milik owner', async () => {
      prisma.scene.findMany.mockResolvedValue([sceneRow] as never);

      const res = await service.list('usr_1');

      expect(prisma.scene.findMany).toHaveBeenCalledWith({
        where: { home: accessibleHomeFilter('usr_1') },
        include: { actions: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(res).toEqual([sceneRow]);
    });

    it('memverifikasi home lalu memfilter homeId', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.scene.findMany.mockResolvedValue([] as never);

      await service.list('usr_1', 'home_1');

      expect(prisma.home.findFirst).toHaveBeenCalledWith({
        where: accessibleHomeWhere('usr_1', 'home_1'),
      });
      expect(prisma.scene.findMany).toHaveBeenCalledWith({
        where: { home: accessibleHomeFilter('usr_1'), homeId: 'home_1' },
        include: { actions: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('melempar NotFoundException bila home bukan miliknya', async () => {
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(service.list('usr_2', 'home_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.scene.findMany).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('mengembalikan scene beserta actions', async () => {
      prisma.scene.findFirst.mockResolvedValue(sceneRow as never);

      const res = await service.get('usr_1', 'scene_1');

      expect(prisma.scene.findFirst).toHaveBeenCalledWith({
        where: { id: 'scene_1', home: accessibleHomeFilter('usr_1') },
        include: { actions: true },
      });
      expect(res.actions).toHaveLength(1);
    });

    it('melempar NotFoundException bila scene bukan miliknya', async () => {
      prisma.scene.findFirst.mockResolvedValue(null as never);

      await expect(service.get('usr_2', 'scene_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('menyimpan actions sebagai relasi nested', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.scene.create.mockResolvedValue(sceneRow as never);

      const res = await service.create('usr_1', {
        name: 'Mode Malam',
        homeId: 'home_1',
        actions: [
          { deviceId: 'dev_1', action: { action: 'turn_on' } },
          { deviceId: 'dev_2', action: { action: 'set_brightness', value: 40 } },
        ],
      });

      expect(prisma.scene.create).toHaveBeenCalledWith({
        data: {
          name: 'Mode Malam',
          homeId: 'home_1',
          actions: {
            create: [
              { deviceId: 'dev_1', action: { action: 'turn_on' } },
              {
                deviceId: 'dev_2',
                action: { action: 'set_brightness', value: 40 },
              },
            ],
          },
        },
        include: { actions: true },
      });
      expect(res.id).toBe('scene_1');
    });

    it('melempar NotFoundException bila home bukan miliknya', async () => {
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(
        service.create('usr_1', {
          name: 'Mode Malam',
          homeId: 'home_1',
          actions: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.scene.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('mengganti seluruh actions ketika actions dikirim', async () => {
      prisma.scene.findFirst.mockResolvedValue(sceneRow as never);
      prisma.scene.update.mockResolvedValue(sceneRow as never);

      await service.update('usr_1', 'scene_1', {
        actions: [{ deviceId: 'dev_9', action: { action: 'turn_off' } }],
      });

      expect(prisma.scene.update).toHaveBeenCalledWith({
        where: { id: 'scene_1' },
        data: {
          actions: {
            deleteMany: {},
            create: [{ deviceId: 'dev_9', action: { action: 'turn_off' } }],
          },
        },
        include: { actions: true },
      });
    });

    it('memverifikasi home tujuan saat homeId diganti', async () => {
      prisma.scene.findFirst.mockResolvedValue(sceneRow as never);
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.scene.update.mockResolvedValue(sceneRow as never);

      await service.update('usr_1', 'scene_1', { homeId: 'home_1' });

      expect(prisma.home.findFirst).toHaveBeenCalledWith({
        where: accessibleHomeWhere('usr_1', 'home_1'),
      });
      expect(prisma.scene.update).toHaveBeenCalledWith({
        where: { id: 'scene_1' },
        data: { homeId: 'home_1' },
        include: { actions: true },
      });
    });

    it('gagal saat pindah ke home milik user lain', async () => {
      prisma.scene.findFirst.mockResolvedValue(sceneRow as never);
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(
        service.update('usr_1', 'scene_1', { homeId: 'home_2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.scene.update).not.toHaveBeenCalled();
    });

    it('mengabaikan actions bila tidak dikirim', async () => {
      prisma.scene.findFirst.mockResolvedValue(sceneRow as never);
      prisma.scene.update.mockResolvedValue({ ...sceneRow, name: 'Baru' } as never);

      const res = await service.update('usr_1', 'scene_1', { name: 'Baru' });

      expect(prisma.scene.update).toHaveBeenCalledWith({
        where: { id: 'scene_1' },
        data: { name: 'Baru' },
        include: { actions: true },
      });
      expect(res.name).toBe('Baru');
    });
  });

  describe('remove', () => {
    it('menghapus scene yang dimiliki', async () => {
      prisma.scene.findFirst.mockResolvedValue(sceneRow as never);
      prisma.scene.delete.mockResolvedValue(sceneRow as never);

      await expect(service.remove('usr_1', 'scene_1')).resolves.toEqual(sceneRow);
      expect(prisma.scene.delete).toHaveBeenCalledWith({ where: { id: 'scene_1' } });
    });

    it('melempar NotFoundException bila scene bukan miliknya', async () => {
      prisma.scene.findFirst.mockResolvedValue(null as never);

      await expect(service.remove('usr_2', 'scene_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.scene.delete).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('menjalankan seluruh action scene', async () => {
      prisma.scene.findFirst.mockResolvedValue({
        ...sceneRow,
        actions: [
          { id: 'sa_1', deviceId: 'dev_1', action: { action: 'turn_on' } },
          {
            id: 'sa_2',
            deviceId: 'dev_2',
            action: { action: 'set_brightness', value: 30 },
          },
        ],
      } as never);
      prisma.device.findFirst
        .mockResolvedValueOnce(deviceRow as never)
        .mockResolvedValueOnce({ ...deviceRow, id: 'dev_2', name: 'Lampu Dinding' } as never);
      deviceCore.executeCommand
        .mockResolvedValueOnce(commandResult as never)
        .mockResolvedValueOnce({ ...commandResult, deviceId: 'dev_2' } as never);

      const res = await service.activate('usr_1', 'scene_1');

      expect(deviceCore.executeCommand).toHaveBeenNthCalledWith(
        1,
        deviceRow,
        'turn_on',
        undefined,
      );
      expect(deviceCore.executeCommand).toHaveBeenNthCalledWith(
        2,
        { ...deviceRow, id: 'dev_2', name: 'Lampu Dinding' },
        'set_brightness',
        30,
      );
      expect(res).toEqual({
        message: 'Scene berhasil dijalankan.',
        results: [commandResult, { ...commandResult, deviceId: 'dev_2' }],
      });
    });

    it('mencatat error per action dan melanjutkan bila perangkat hilang', async () => {
      prisma.scene.findFirst.mockResolvedValue({
        ...sceneRow,
        actions: [
          { id: 'sa_1', deviceId: 'dev_1', action: { action: 'turn_on' } },
          { id: 'sa_2', deviceId: 'dev_hilang', action: { action: 'turn_on' } },
        ],
      } as never);
      prisma.device.findFirst
        .mockResolvedValueOnce(deviceRow as never)
        .mockResolvedValueOnce(null as never);
      deviceCore.executeCommand.mockResolvedValue(commandResult as never);

      const res = await service.activate('usr_1', 'scene_1');

      expect(res.results).toEqual([
        commandResult,
        { deviceId: 'dev_hilang', error: 'Perangkat tidak ditemukan.' },
      ]);
    });

    it('mengembalikan hasil kosong bila scene tidak punya action', async () => {
      prisma.scene.findFirst.mockResolvedValue({
        ...sceneRow,
        actions: [],
      } as never);

      const res = await service.activate('usr_1', 'scene_1');

      expect(res).toEqual({ message: 'Scene berhasil dijalankan.', results: [] });
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('melempar NotFoundException bila scene bukan miliknya', async () => {
      prisma.scene.findFirst.mockResolvedValue(null as never);

      await expect(service.activate('usr_2', 'scene_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });
  });
});
