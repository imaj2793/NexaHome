import { NotFoundException } from '@nestjs/common';
import { AutomationTriggerType } from '@prisma/client';
import { AutomationService } from './automation.service';
import type { DeviceCoreService } from '../device-core/device-core.service';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  home: { findFirst: vi.fn() },
  automation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  device: { findFirst: vi.fn() },
});

const makeDeviceCore = () => ({ executeCommand: vi.fn() });

const homeRow = { id: 'home_1', ownerId: 'usr_1' };
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
const automationRow = {
  id: 'auto_1',
  name: 'Lampu Malam',
  homeId: 'home_1',
  triggers: [{ id: 'tr_1', type: AutomationTriggerType.SCHEDULE, config: { time: '22:00' } }],
  actions: [{ id: 'ac_1', deviceId: 'dev_1', action: { action: 'turn_on' } }],
};

describe('AutomationService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let deviceCore: ReturnType<typeof makeDeviceCore>;
  let service: AutomationService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    deviceCore = makeDeviceCore();
    service = new AutomationService(
      prisma as unknown as PrismaService,
      deviceCore as unknown as DeviceCoreService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('lifecycle', () => {
    it('onModuleInit menjadwalkan tick dan onModuleDestroy membersihkannya', () => {
      vi.useFakeTimers();
      try {
        service.onModuleInit();
        expect(vi.getTimerCount()).toBe(1);
        service.onModuleDestroy();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('tick tidak melempar saat query Prisma gagal', async () => {
      prisma.automation.findMany.mockRejectedValue(new Error('db down'));

      await expect(
        (service as unknown as { tick: () => Promise<void> }).tick(),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('mengambil semua automation milik owner', async () => {
      prisma.automation.findMany.mockResolvedValue([automationRow] as never);

      const res = await service.list('usr_1');

      expect(prisma.automation.findMany).toHaveBeenCalledWith({
        where: { home: { ownerId: 'usr_1' } },
        include: { triggers: true, actions: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(res).toEqual([automationRow]);
    });

    it('memverifikasi home lalu memfilter homeId', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.automation.findMany.mockResolvedValue([] as never);

      await service.list('usr_1', 'home_1');

      expect(prisma.home.findFirst).toHaveBeenCalledWith({
        where: { id: 'home_1', ownerId: 'usr_1' },
      });
      expect(prisma.automation.findMany).toHaveBeenCalledWith({
        where: { home: { ownerId: 'usr_1' }, homeId: 'home_1' },
        include: { triggers: true, actions: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('melempar NotFoundException bila home bukan miliknya', async () => {
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(service.list('usr_2', 'home_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.automation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('mengembalikan automation dengan triggers dan actions', async () => {
      prisma.automation.findFirst.mockResolvedValue(automationRow as never);

      const res = await service.get('usr_1', 'auto_1');

      expect(prisma.automation.findFirst).toHaveBeenCalledWith({
        where: { id: 'auto_1', home: { ownerId: 'usr_1' } },
        include: { triggers: true, actions: true },
      });
      expect(res.triggers).toHaveLength(1);
    });

    it('melempar NotFoundException bila automation bukan miliknya', async () => {
      prisma.automation.findFirst.mockResolvedValue(null as never);

      await expect(service.get('usr_2', 'auto_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('menyimpan triggers dan actions sebagai relasi nested', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.automation.create.mockResolvedValue(automationRow as never);

      await service.create('usr_1', {
        name: 'Lampu Malam',
        homeId: 'home_1',
        triggers: [{ type: AutomationTriggerType.SCHEDULE, config: { time: '22:00' } }],
        actions: [{ deviceId: 'dev_1', action: { action: 'turn_on' } }],
      });

      expect(prisma.automation.create).toHaveBeenCalledWith({
        data: {
          name: 'Lampu Malam',
          homeId: 'home_1',
          enabled: true,
          triggers: {
            create: [
              { type: AutomationTriggerType.SCHEDULE, config: { time: '22:00' } },
            ],
          },
          actions: {
            create: [{ deviceId: 'dev_1', action: { action: 'turn_on' } }],
          },
        },
        include: { triggers: true, actions: true },
      });
    });

    it('memakai enabled dari DTO bila diberikan', async () => {
      prisma.home.findFirst.mockResolvedValue(homeRow as never);
      prisma.automation.create.mockResolvedValue(automationRow as never);

      await service.create('usr_1', {
        name: 'Lampu Malam',
        homeId: 'home_1',
        enabled: false,
        triggers: [],
        actions: [{ deviceId: null, action: { action: 'turn_on' } }],
      });

      const call = prisma.automation.create.mock.calls[0][0] as unknown as {
        data: { enabled: boolean; actions: { create: Array<{ deviceId: string | null }> } };
      };
      expect(call.data.enabled).toBe(false);
      expect(call.data.actions.create[0].deviceId).toBeNull();
    });

    it('melempar NotFoundException bila home bukan miliknya', async () => {
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(
        service.create('usr_2', {
          name: 'X',
          homeId: 'home_1',
          triggers: [],
          actions: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.automation.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('hanya memasukkan field yang dikirim', async () => {
      prisma.automation.findFirst.mockResolvedValue(automationRow as never);
      prisma.automation.update.mockResolvedValue(automationRow as never);

      await service.update('usr_1', 'auto_1', { name: 'Baru', enabled: false });

      expect(prisma.automation.update).toHaveBeenCalledWith({
        where: { id: 'auto_1' },
        data: { name: 'Baru', enabled: false },
        include: { triggers: true, actions: true },
      });
    });

    it('mengganti seluruh triggers dan actions saat dikirim', async () => {
      prisma.automation.findFirst.mockResolvedValue(automationRow as never);
      prisma.automation.update.mockResolvedValue(automationRow as never);

      await service.update('usr_1', 'auto_1', {
        triggers: [{ type: AutomationTriggerType.SENSOR, config: { key: 'temp' } }],
        actions: [{ deviceId: 'dev_2', action: { action: 'turn_off' } }],
      });

      expect(prisma.automation.update).toHaveBeenCalledWith({
        where: { id: 'auto_1' },
        data: {
          triggers: {
            deleteMany: {},
            create: [{ type: AutomationTriggerType.SENSOR, config: { key: 'temp' } }],
          },
          actions: {
            deleteMany: {},
            create: [{ deviceId: 'dev_2', action: { action: 'turn_off' } }],
          },
        },
        include: { triggers: true, actions: true },
      });
    });

    it('gagal saat pindah ke home milik user lain', async () => {
      prisma.automation.findFirst.mockResolvedValue(automationRow as never);
      prisma.home.findFirst.mockResolvedValue(null as never);

      await expect(
        service.update('usr_1', 'auto_1', { homeId: 'home_2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.automation.update).not.toHaveBeenCalled();
    });

    it('melempar NotFoundException bila automation bukan miliknya', async () => {
      prisma.automation.findFirst.mockResolvedValue(null as never);

      await expect(
        service.update('usr_2', 'auto_1', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.automation.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('menghapus automation yang dimiliki', async () => {
      prisma.automation.findFirst.mockResolvedValue(automationRow as never);
      prisma.automation.delete.mockResolvedValue(automationRow as never);

      await expect(service.remove('usr_1', 'auto_1')).resolves.toEqual(
        automationRow,
      );
      expect(prisma.automation.delete).toHaveBeenCalledWith({
        where: { id: 'auto_1' },
      });
    });

    it('melempar NotFoundException bila automation bukan miliknya', async () => {
      prisma.automation.findFirst.mockResolvedValue(null as never);

      await expect(service.remove('usr_2', 'auto_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.automation.delete).not.toHaveBeenCalled();
    });
  });

  describe('runNow', () => {
    it('menjalankan seluruh actions dan melaporkan jumlah eksekusi', async () => {
      prisma.automation.findFirst.mockResolvedValue(automationRow as never);
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);
      deviceCore.executeCommand.mockResolvedValue(commandResult as never);

      const res = await service.runNow('usr_1', 'auto_1');

      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'dev_1', homeId: 'home_1' },
      });
      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        deviceRow,
        'turn_on',
        undefined,
      );
      expect(res).toEqual({
        automationId: 'auto_1',
        executed: 1,
        results: [commandResult],
      });
    });

    it('melewati action tanpa deviceId', async () => {
      prisma.automation.findFirst.mockResolvedValue({
        ...automationRow,
        actions: [{ id: 'ac_1', deviceId: null, action: { action: 'turn_on' } }],
      } as never);

      const res = await service.runNow('usr_1', 'auto_1');

      expect(res).toEqual({ automationId: 'auto_1', executed: 0, results: [] });
      expect(prisma.device.findFirst).not.toHaveBeenCalled();
    });

    it('melewati action yang tidak punya nama action', async () => {
      prisma.automation.findFirst.mockResolvedValue({
        ...automationRow,
        actions: [{ id: 'ac_1', deviceId: 'dev_1', action: {} }],
      } as never);
      prisma.device.findFirst.mockResolvedValue(deviceRow as never);

      const res = await service.runNow('usr_1', 'auto_1');

      expect(res.executed).toBe(0);
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('lewati aksi dan lanjut bila perangkat tidak ditemukan di home tersebut', async () => {
      prisma.automation.findFirst.mockResolvedValue({
        ...automationRow,
        actions: [
          { id: 'ac_1', deviceId: 'dev_hilang', action: { action: 'turn_on' } },
          { id: 'ac_2', deviceId: 'dev_1', action: { action: 'turn_on' } },
        ],
      } as never);
      prisma.device.findFirst
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(deviceRow as never);
      deviceCore.executeCommand.mockResolvedValue(commandResult as never);

      const res = await service.runNow('usr_1', 'auto_1');

      expect(res.executed).toBe(1);
      expect(res.results).toEqual([commandResult]);
    });

    it('menangkap error DeviceCore tanpa menggagalkan aksi lain', async () => {
      prisma.automation.findFirst.mockResolvedValue({
        ...automationRow,
        actions: [
          { id: 'ac_1', deviceId: 'dev_1', action: { action: 'turn_on' } },
          { id: 'ac_2', deviceId: 'dev_2', action: { action: 'turn_off' } },
        ],
      } as never);
      prisma.device.findFirst
        .mockResolvedValueOnce(deviceRow as never)
        .mockResolvedValueOnce({ ...deviceRow, id: 'dev_2' } as never);
      deviceCore.executeCommand
        .mockRejectedValueOnce(new Error('integration gagal'))
        .mockResolvedValueOnce({ ...commandResult, deviceId: 'dev_2' } as never);

      const res = await service.runNow('usr_1', 'auto_1');

      expect(res.executed).toBe(1);
      expect(res.results).toEqual([{ ...commandResult, deviceId: 'dev_2' }]);
    });

    it('melempar NotFoundException bila automation bukan miliknya', async () => {
      prisma.automation.findFirst.mockResolvedValue(null as never);

      await expect(service.runNow('usr_2', 'auto_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('scheduler', () => {
    it('menjalankan automation yang jam trigger-nya cocok', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-04T22:00:00.000'));
      try {
        prisma.automation.findMany.mockResolvedValue([automationRow] as never);
        prisma.device.findFirst.mockResolvedValue(deviceRow as never);
        deviceCore.executeCommand.mockResolvedValue(commandResult as never);

        await (service as unknown as { tick: () => Promise<void> }).tick();

        expect(deviceCore.executeCommand).toHaveBeenCalledWith(
          deviceRow,
          'turn_on',
          undefined,
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('melewati automation yang jam trigger-nya tidak cocok', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-04T21:00:00.000'));
      try {
        prisma.automation.findMany.mockResolvedValue([automationRow] as never);

        await (service as unknown as { tick: () => Promise<void> }).tick();

        expect(prisma.automation.findMany).toHaveBeenCalledWith({
          where: {
            enabled: true,
            triggers: { some: { type: AutomationTriggerType.SCHEDULE } },
          },
          include: { triggers: true, actions: true },
        });
        expect(deviceCore.executeCommand).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('mengecek ulang menit yang sama hanya sekali', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-04T22:00:00.000'));
      try {
        prisma.automation.findMany.mockResolvedValue([] as never);
        const internals = service as unknown as { tick: () => Promise<void> };

        await internals.tick();
        await internals.tick();

        expect(prisma.automation.findMany).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
