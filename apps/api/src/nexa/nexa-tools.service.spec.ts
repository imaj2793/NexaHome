import type { PrismaService } from '../prisma/prisma.service';
import type {
  CommandResult,
  DeviceCoreService,
  ExecutableDevice,
} from '../device-core/device-core.service';
import type { ScenesService } from '../scenes/scenes.service';
import type { AutomationService } from '../automation/automation.service';
import type { EnergyService } from '../energy/energy.service';
import {
  NexaToolsService,
  type NexaToolContext,
} from './nexa-tools.service';

/** Device milik user yang dipakai di seluruh test. */
const ownedDevice: ExecutableDevice = {
  id: 'dev_1',
  name: 'Lampu Kamar',
  homeId: 'home_1',
  integrationId: null,
  externalId: null,
  state: { power: false, brightness: 50 },
};

const okCommand: CommandResult = {
  deviceId: ownedDevice.id,
  state: { power: true },
  message: 'Lampu Kamar dinyalakan.',
  external: false,
};

describe('NexaToolsService', () => {
  const ctx: NexaToolContext = { userId: 'user_1' };

  let prisma: { device: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }; room: { findFirst: ReturnType<typeof vi.fn> }; scene: { findFirst: ReturnType<typeof vi.fn> }; home: { findFirst: ReturnType<typeof vi.fn> } };
  let deviceCore: { executeCommand: ReturnType<typeof vi.fn> };
  let scenes: { activate: ReturnType<typeof vi.fn> };
  let automation: { create: ReturnType<typeof vi.fn> };
  let energy: { summary: ReturnType<typeof vi.fn> };
  let service: NexaToolsService;

  beforeEach(() => {
    prisma = {
      device: { findMany: vi.fn(), findFirst: vi.fn() },
      room: { findFirst: vi.fn() },
      scene: { findFirst: vi.fn() },
      home: { findFirst: vi.fn() },
    };
    deviceCore = { executeCommand: vi.fn().mockResolvedValue(okCommand) };
    scenes = {
      activate: vi.fn().mockResolvedValue({
        message: 'Scene aktif.',
        results: [],
      }),
    };
    automation = {
      create: vi.fn().mockResolvedValue({ id: 'auto_1', name: 'Draft' }),
    };
    energy = {
      summary: vi.fn().mockResolvedValue({
        totalWatts: 120,
        activeCount: 2,
        estimatedKwhPerDay: 2.88,
        devices: [],
      }),
    };

    service = new NexaToolsService(
      prisma as unknown as PrismaService,
      deviceCore as unknown as DeviceCoreService,
      scenes as unknown as ScenesService,
      automation as unknown as AutomationService,
      energy as unknown as EnergyService,
    );
  });

  describe('getToolDefinitions', () => {
    it('mengembalikan 11 definisi tool dengan nama yang tepat', () => {
      const defs = service.getToolDefinitions();

      expect(defs).toHaveLength(11);
      expect(defs.map((d) => d.name)).toEqual([
        'get_devices',
        'get_device_status',
        'turn_on_device',
        'turn_off_device',
        'set_brightness',
        'set_color',
        'set_temperature',
        'get_room_status',
        'activate_scene',
        'create_automation',
        'get_energy_usage',
      ]);
    });

    it('menyertakan deskripsi dan JSON Schema untuk setiap tool', () => {
      for (const def of service.getToolDefinitions()) {
        expect(def.description.length).toBeGreaterThan(0);
        expect(def.parameters).toMatchObject({ type: 'object' });
        expect(Array.isArray(def.parameters.required)).toBe(true);
      }
    });

    it('mendeklarasikan device_id sebagai argumen wajib pada tool perangkat', () => {
      const defs = service.getToolDefinitions();
      const byName = new Map(defs.map((d) => [d.name, d]));

      for (const name of [
        'get_device_status',
        'turn_on_device',
        'turn_off_device',
        'set_brightness',
        'set_color',
        'set_temperature',
      ]) {
        const required = byName.get(name)?.parameters.required;
        expect(required).toContain('device_id');
      }
    });
  });

  describe('execute — jalur tiap tool', () => {
    it('menolak tool yang tidak dikenal tanpa melempar error', async () => {
      const result = await service.execute('hapus_rumah', {}, ctx);

      expect(result).toEqual({
        success: false,
        message: 'Tool tidak dikenal: hapus_rumah',
        result: null,
      });
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('get_devices mengembalikan seluruh perangkat milik user', async () => {
      prisma.device.findMany.mockResolvedValue([ownedDevice]);

      const result = await service.execute('get_devices', {}, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Ditemukan 1 perangkat.');
      expect(result.result).toEqual([ownedDevice]);
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { home: { ownerId: 'user_1' } },
        include: { room: true },
      });
    });

    it('get_devices melaporkan jumlah nol tanpa gagal', async () => {
      prisma.device.findMany.mockResolvedValue([]);

      const result = await service.execute('get_devices', {}, ctx);

      expect(result).toEqual({
        success: true,
        message: 'Ditemukan 0 perangkat.',
        result: [],
      });
    });

    it('get_device_status mengembalikan device_id dan state terkini', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const result = await service.execute(
        'get_device_status',
        { device_id: 'dev_1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        device_id: 'dev_1',
        state: { power: false, brightness: 50 },
      });
      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'dev_1', home: { ownerId: 'user_1' } },
        include: { integration: true },
      });
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('turn_on_device meneruskan perintah ke DeviceCoreService', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const result = await service.execute(
        'turn_on_device',
        { device_id: 'dev_1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe(okCommand.message);
      expect(result.result).toEqual(okCommand);
      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        ownedDevice,
        'turn_on',
        undefined,
      );
    });

    it('turn_off_device meneruskan perintah ke DeviceCoreService', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const result = await service.execute(
        'turn_off_device',
        { device_id: 'dev_1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        ownedDevice,
        'turn_off',
        undefined,
      );
    });

    it('set_brightness meneruskan nilai numerik tervalidasi', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const result = await service.execute(
        'set_brightness',
        { device_id: 'dev_1', value: 80 },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        ownedDevice,
        'set_brightness',
        80,
      );
    });

    it('set_brightness menerima nilai batas 0 dan 100', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const low = await service.execute(
        'set_brightness',
        { device_id: 'dev_1', value: 0 },
        ctx,
      );
      const high = await service.execute(
        'set_brightness',
        { device_id: 'dev_1', value: 100 },
        ctx,
      );

      expect(low.success).toBe(true);
      expect(high.success).toBe(true);
      expect(deviceCore.executeCommand).toHaveBeenNthCalledWith(
        1,
        ownedDevice,
        'set_brightness',
        0,
      );
      expect(deviceCore.executeCommand).toHaveBeenNthCalledWith(
        2,
        ownedDevice,
        'set_brightness',
        100,
      );
    });

    it('set_color meneruskan objek RGB yang sudah divalidasi', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const result = await service.execute(
        'set_color',
        { device_id: 'dev_1', color: { r: 255, g: 0, b: 128 } },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        ownedDevice,
        'set_color',
        { r: 255, g: 0, b: 128 },
      );
    });

    it('set_color membuang properti tambahan dari input warna', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      await service.execute(
        'set_color',
        {
          device_id: 'dev_1',
          color: { r: 1, g: 2, b: 3, hex: '#010203' },
        },
        ctx,
      );

      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        ownedDevice,
        'set_color',
        { r: 1, g: 2, b: 3 },
      );
    });

    it('set_temperature meneruskan nilai numerik', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const result = await service.execute(
        'set_temperature',
        { device_id: 'dev_1', value: 24.5 },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(deviceCore.executeCommand).toHaveBeenCalledWith(
        ownedDevice,
        'set_temperature',
        24.5,
      );
    });

    it('set_temperature menolak nilai NaN dan non-number', async () => {
      const nanResult = await service.execute(
        'set_temperature',
        { device_id: 'dev_1', value: Number.NaN },
        ctx,
      );
      const strResult = await service.execute(
        'set_temperature',
        { device_id: 'dev_1', value: 'dingin' },
        ctx,
      );

      expect(nanResult).toEqual({
        success: false,
        message: 'value harus berupa angka.',
        result: null,
      });
      expect(strResult.success).toBe(false);
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('get_room_status mengembalikan ruangan beserta perangkatnya', async () => {
      prisma.room.findFirst.mockResolvedValue({
        id: 'room_1',
        name: 'Kamar',
        devices: [ownedDevice],
      });

      const result = await service.execute(
        'get_room_status',
        { room_id: 'room_1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Ruangan Kamar memiliki 1 perangkat.');
      expect(prisma.room.findFirst).toHaveBeenCalledWith({
        where: { id: 'room_1', home: { ownerId: 'user_1' } },
        include: { devices: true },
      });
    });

    it('get_room_status gagal bila ruangan bukan milik user', async () => {
      prisma.room.findFirst.mockResolvedValue(null);

      const result = await service.execute(
        'get_room_status',
        { room_id: 'room_lain' },
        ctx,
      );

      expect(result).toEqual({
        success: false,
        message: 'Ruangan tidak ditemukan.',
        result: null,
      });
    });

    it('activate_scene mengaktifkan scene yang ditemukan', async () => {
      prisma.scene.findFirst.mockResolvedValue({ id: 'scene_1', name: 'Movie Night' });

      const result = await service.execute(
        'activate_scene',
        { scene_name: 'Movie Night' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Scene aktif.');
      expect(scenes.activate).toHaveBeenCalledWith('user_1', 'scene_1');
      expect(prisma.scene.findFirst).toHaveBeenCalledWith({
        where: {
          home: { ownerId: 'user_1' },
          name: { equals: 'Movie Night', mode: 'insensitive' },
        },
      });
    });

    it('activate_scene gagal bila nama scene tidak ada', async () => {
      prisma.scene.findFirst.mockResolvedValue(null);

      const result = await service.execute(
        'activate_scene',
        { scene_name: 'Tidak Ada' },
        ctx,
      );

      expect(result).toEqual({
        success: false,
        message: 'Scene "Tidak Ada" tidak ditemukan.',
        result: null,
      });
      expect(scenes.activate).not.toHaveBeenCalled();
    });

    it('create_automation membuat draft pada home milik user', async () => {
      prisma.home.findFirst.mockResolvedValue({ id: 'home_1' });

      const result = await service.execute(
        'create_automation',
        { description: 'Matikan lampu jam 22:00' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Automation "Matikan lampu jam 22:00" dibuat (draft).');
      expect(automation.create).toHaveBeenCalledWith('user_1', {
        name: 'Matikan lampu jam 22:00',
        homeId: 'home_1',
        enabled: true,
        triggers: [],
        actions: [],
      });
    });

    it('create_automation gagal bila user tidak punya home', async () => {
      prisma.home.findFirst.mockResolvedValue(null);

      const result = await service.execute(
        'create_automation',
        { description: 'Apapun' },
        ctx,
      );

      expect(result).toEqual({
        success: false,
        message: 'Home tidak ditemukan.',
        result: null,
      });
      expect(automation.create).not.toHaveBeenCalled();
    });

    it('get_energy_usage merangkum pemakaian energi user', async () => {
      const result = await service.execute('get_energy_usage', {}, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Total pemakaian 120 W.');
      expect(result.result).toMatchObject({ totalWatts: 120, activeCount: 2 });
      expect(energy.summary).toHaveBeenCalledWith('user_1');
    });
  });

  describe('execute — safety layer', () => {
    it('menolak device_id kosong tanpa memanggil DeviceCoreService', async () => {
      const kosong = await service.execute(
        'get_device_status',
        { device_id: '' },
        ctx,
      );
      const spasi = await service.execute(
        'get_device_status',
        { device_id: '   ' },
        ctx,
      );
      const hilang = await service.execute('get_device_status', {}, ctx);
      const bukanString = await service.execute(
        'turn_on_device',
        { device_id: 42 },
        ctx,
      );

      for (const result of [kosong, spasi, hilang, bukanString]) {
        expect(result.success).toBe(false);
        expect(result.result).toBeNull();
      }
      expect(kosong.message).toBe('device_id harus berupa string non-kosong.');
      expect(prisma.device.findFirst).not.toHaveBeenCalled();
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('menolak device_id kosong pada turn_on_device', async () => {
      const result = await service.execute(
        'turn_on_device',
        { device_id: '' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('menolak brightness di luar rentang 0–100', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const terlaluBesar = await service.execute(
        'set_brightness',
        { device_id: 'dev_1', value: 101 },
        ctx,
      );
      const terlaluKecil = await service.execute(
        'set_brightness',
        { device_id: 'dev_1', value: -1 },
        ctx,
      );
      const bukanAngka = await service.execute(
        'set_brightness',
        { device_id: 'dev_1', value: '80' },
        ctx,
      );

      for (const result of [terlaluBesar, terlaluKecil, bukanAngka]) {
        expect(result).toEqual({
          success: false,
          message: 'value harus berupa angka 0–100.',
          result: null,
        });
      }
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('menolak color yang tidak berbentuk { r, g, b }', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);

      const warna = '#ff0000';
      const diLuarRentang = { r: 256, g: 0, b: 0 };
      const kurangProperti = { r: 1, g: 2 };
      const stringAngka = { r: '255', g: '0', b: '0' };
      const kosong = null;

      for (const color of [
        warna,
        diLuarRentang,
        kurangProperti,
        stringAngka,
        kosong,
      ]) {
        const result = await service.execute(
          'set_color',
          { device_id: 'dev_1', color },
          ctx,
        );
        expect(result).toEqual({
          success: false,
          message: 'color harus berupa objek { r, g, b } dengan angka 0–255.',
          result: null,
        });
      }
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('menolak device_id kosong pada get_room_status, activate_scene, dan create_automation', async () => {
      const room = await service.execute('get_room_status', { room_id: '' }, ctx);
      const scene = await service.execute(
        'activate_scene',
        { scene_name: '  ' },
        ctx,
      );
      const auto = await service.execute('create_automation', {}, ctx);

      expect(room.message).toBe('room_id harus berupa string non-kosong.');
      expect(scene.message).toBe('scene_name harus berupa string non-kosong.');
      expect(auto.message).toBe('description harus berupa string non-kosong.');
      expect(room.success).toBe(false);
      expect(scene.success).toBe(false);
      expect(auto.success).toBe(false);
    });

    it('menolak perangkat yang bukan milik user', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      const status = await service.execute(
        'get_device_status',
        { device_id: 'dev_orang_lain' },
        ctx,
      );
      const nyalakan = await service.execute(
        'turn_on_device',
        { device_id: 'dev_orang_lain' },
        ctx,
      );

      for (const result of [status, nyalakan]) {
        expect(result).toEqual({
          success: false,
          message: 'Perangkat tidak ditemukan.',
          result: null,
        });
      }
      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'dev_orang_lain', home: { ownerId: 'user_1' } },
        include: { integration: true },
      });
      expect(deviceCore.executeCommand).not.toHaveBeenCalled();
    });

    it('menangkap error dari DeviceCoreService dan tidak pernah menolak promise', async () => {
      prisma.device.findFirst.mockResolvedValue(ownedDevice);
      deviceCore.executeCommand.mockRejectedValue(new Error('Integrasi MQTT mati.'));

      const result = await service.execute(
        'turn_on_device',
        { device_id: 'dev_1' },
        ctx,
      );

      expect(result).toEqual({
        success: false,
        message: 'Integrasi MQTT mati.',
        result: null,
      });
    });

    it('menangkap error dari Prisma dan mengembalikannya sebagai hasil', async () => {
      prisma.device.findMany.mockRejectedValue(new Error('Database tidak merespons.'));

      const result = await service.execute('get_devices', {}, ctx);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Database tidak merespons.');
    });

    it('menangani error non-Error dengan aman', async () => {
      prisma.device.findMany.mockRejectedValue('koneksi putus');

      const result = await service.execute('get_devices', {}, ctx);

      expect(result).toEqual({
        success: false,
        message: 'koneksi putus',
        result: null,
      });
    });

    it('tidak pernah menolak promise pada seluruh tool yang gagal', async () => {
      prisma.device.findFirst.mockResolvedValue(null);
      prisma.device.findMany.mockRejectedValue(new Error('boom'));
      prisma.room.findFirst.mockRejectedValue(new Error('boom'));
      prisma.scene.findFirst.mockRejectedValue(new Error('boom'));
      prisma.home.findFirst.mockRejectedValue(new Error('boom'));
      energy.summary.mockRejectedValue(new Error('boom'));

      const names = service.getToolDefinitions().map((d) => d.name);
      const results = await Promise.all(
        names.map((name) =>
          service.execute(name, { device_id: 'dev_1', room_id: 'r1' }, ctx),
        ),
      );

      expect(results).toHaveLength(11);
      for (const result of results) {
        expect(result.success).toBe(false);
        expect(typeof result.message).toBe('string');
        expect(result.result).toBeNull();
      }
    });
  });
});
