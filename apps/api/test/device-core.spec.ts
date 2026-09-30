import { NotFoundException } from '@nestjs/common';
import {
  applyCommandToState,
  DiscoveredDevice,
  humanizeCommand,
  IntegrationAdapter,
  IntegrationCommand,
  IntegrationManager,
  IntegrationType,
  toIntegrationCommand,
} from '@nexahome/device-core';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';
import { DeviceCoreService } from '../src/device-core/device-core.service';
import { DeviceGateway } from '../src/device-core/device.gateway';
import type { PrismaService } from '../src/prisma/prisma.service';

// ── mock IndexedDB-free: IntegrationManager nyata dipakai sebagai registry ──

const stubAdapter = (type: IntegrationType): IntegrationAdapter => ({
  type,
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  discoverDevices: vi.fn(async () => [] as DiscoveredDevice[]),
  getDeviceState: vi.fn(async () => ({})),
  executeCommand: vi.fn(async () => ({})),
});

describe('IntegrationManager', () => {
  let manager: IntegrationManager;

  beforeEach(() => {
    manager = new IntegrationManager();
  });

  it('daftar kosong sebelum ada adapter yang register', () => {
    expect(manager.list()).toEqual([]);
    expect(manager.has('TASMOTA')).toBe(false);
    expect(manager.get('SHELLY')).toBeUndefined();
  });

  it('register adapter berdasarkan tipenya', () => {
    const shelly = stubAdapter('SHELLY');
    const mqtt = stubAdapter('MQTT');
    manager.register(shelly);
    manager.register(mqtt);

    expect(manager.list()).toEqual(['SHELLY', 'MQTT']);
    expect(manager.get('SHELLY')).toBe(shelly);
    expect(manager.has('MQTT')).toBe(true);
  });

  it('register ulang menimpa adapter dengan tipe sama', () => {
    const pertama = stubAdapter('SHELLY');
    const kedua = stubAdapter('SHELLY');
    manager.register(pertama);
    manager.register(kedua);

    expect(manager.list()).toEqual(['SHELLY']);
    expect(manager.get('SHELLY')).toBe(kedua);
  });

  it('executeCommand merutekan perintah ke adapter sesuai tipe', async () => {
    const shelly = stubAdapter('SHELLY');
    const tasmota = stubAdapter('TASMOTA');
    (shelly.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
      power: true,
    });
    (tasmota.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
      power: false,
    });
    manager.register(shelly);
    manager.register(tasmota);

    const command: IntegrationCommand = { capability: 'power', value: true };
    expect(await manager.executeCommand('SHELLY', 'lampu', command)).toEqual({
      power: true,
    });
    expect(shelly.executeCommand).toHaveBeenCalledWith('lampu', command);
    expect(tasmota.executeCommand).not.toHaveBeenCalled();

    await manager.executeCommand('TASMOTA', 'relay', command);
    expect(tasmota.executeCommand).toHaveBeenCalledWith('relay', command);
    expect(shelly.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('executeCommand melempar error saat tipe tidak terdaftar', async () => {
    manager.register(stubAdapter('MQTT'));
    await expect(
      manager.executeCommand('SHELLY', 'perangkat', {
        capability: 'power',
        value: true,
      }),
    ).rejects.toThrow('Tidak ada integration untuk tipe "SHELLY".');
  });

  it('discover meneruskan ke adapter yang tepat', async () => {
    const mqtt = stubAdapter('MQTT');
    (mqtt.discoverDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'sensor_1',
        name: 'Sensor 1',
        type: 'sensor',
        capabilities: ['temperature'],
        state: { temperature: 21 },
      },
    ]);
    manager.register(mqtt);

    expect(await manager.discover('MQTT')).toEqual([
      {
        id: 'sensor_1',
        name: 'Sensor 1',
        type: 'sensor',
        capabilities: ['temperature'],
        state: { temperature: 21 },
      },
    ]);
  });

  it('discover melempar error saat tipe tidak terdaftar', async () => {
    await expect(manager.discover('ESP32')).rejects.toThrow(
      'Tidak ada integration untuk tipe "ESP32".',
    );
  });

  it('discoverAll menggabungkan hasil semua adapter', async () => {
    const shelly = stubAdapter('SHELLY');
    (shelly.discoverDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'shelly_1',
        name: 'Shelly 1',
        type: 'switch',
        capabilities: ['power'],
        state: { power: true },
      },
    ]);
    const mqtt = stubAdapter('MQTT');
    (mqtt.discoverDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'mqtt_1',
        name: 'MQTT 1',
        type: 'sensor',
        capabilities: ['temperature'],
        state: {},
      },
    ]);
    manager.register(shelly);
    manager.register(mqtt);

    const all = await manager.discoverAll();
    expect(all.map((d) => d.id)).toEqual(['shelly_1', 'mqtt_1']);
  });

  it('discoverAll melewati adapter yang gagal tanpa melempar error', async () => {
    const rusak = stubAdapter('SHELLY');
    (rusak.discoverDevices as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('socket gagal'),
    );
    const baik = stubAdapter('MQTT');
    (baik.discoverDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'mqtt_1',
        name: 'MQTT 1',
        type: 'sensor',
        capabilities: [],
        state: {},
      },
    ]);
    manager.register(rusak);
    manager.register(baik);

    const all = await manager.discoverAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('mqtt_1');
  });

  it('mode mock tidak mengarang perangkat untuk hasil scan', async () => {
    // Regression guard: adapter mock pernah mengembalikan sensor/lampu fiktif
    // sehingga UI menampilkan perangkat yang tidak ada di jaringan.
    manager.register(new MqttAdapter({ mode: 'mock' }));
    manager.register(new TasmotaAdapter({ mode: 'mock' }));

    await expect(manager.discoverAll()).resolves.toEqual([]);
    await expect(manager.discover('MQTT')).resolves.toEqual([]);
    await expect(manager.discover('TASMOTA')).resolves.toEqual([]);
  });

  it('tetap bisa mengeksekusi perintah pada mode mock', async () => {
    const tasmota = new TasmotaAdapter({ mode: 'mock' });
    manager.register(tasmota);

    const state = await manager.executeCommand('TASMOTA', 'tasmota_relay_01', {
      capability: 'power',
      value: false,
    });
    expect(state).toMatchObject({ power: false });
  });
});

describe('toIntegrationCommand', () => {
  it('memetakan turn_on ke capability power true', () => {
    expect(toIntegrationCommand('turn_on')).toEqual({
      capability: 'power',
      value: true,
    });
  });

  it('memetakan turn_off ke capability power false', () => {
    expect(toIntegrationCommand('turn_off')).toEqual({
      capability: 'power',
      value: false,
    });
  });

  it('memetakan set_brightness dan membulatkan nilainya', () => {
    expect(toIntegrationCommand('set_brightness', 55)).toEqual({
      capability: 'brightness',
      value: 55,
    });
    expect(toIntegrationCommand('set_brightness', 55.6)).toEqual({
      capability: 'brightness',
      value: 56,
    });
  });

  it('membatasi brightness ke rentang 0-100', () => {
    expect(toIntegrationCommand('set_brightness', 150)).toEqual({
      capability: 'brightness',
      value: 100,
    });
    expect(toIntegrationCommand('set_brightness', -20)).toEqual({
      capability: 'brightness',
      value: 0,
    });
  });

  it('menerima brightness berupa string dan NaN fallback ke 0', () => {
    expect(toIntegrationCommand('set_brightness', '42')).toEqual({
      capability: 'brightness',
      value: 42,
    });
    expect(toIntegrationCommand('set_brightness', 'abc')).toEqual({
      capability: 'brightness',
      value: 0,
    });
  });

  it('memetakan set_color dan set_temperature apa adanya', () => {
    const warna = { r: 1, g: 2, b: 3 };
    expect(toIntegrationCommand('set_color', warna)).toEqual({
      capability: 'color',
      value: warna,
    });
    expect(toIntegrationCommand('set_temperature', 3000)).toEqual({
      capability: 'temperature',
      value: 3000,
    });
  });

  it('melempar error untuk aksi yang tidak dikenal', () => {
    expect(() => toIntegrationCommand('ledakan')).toThrow(
      'Aksi tidak dikenal: ledakan',
    );
  });
});

describe('applyCommandToState', () => {
  it('menyalakan power tanpa mengubah field lain', () => {
    expect(applyCommandToState({ power: false, brightness: 40 }, 'turn_on')).toEqual({
      power: true,
      brightness: 40,
    });
  });

  it('mematikan power', () => {
    expect(applyCommandToState({ power: true }, 'turn_off')).toEqual({
      power: false,
    });
  });

  it('kecerahan di atas 0 otomatis menyalakan power', () => {
    expect(
      applyCommandToState({ power: false, brightness: 0 }, 'set_brightness', 70),
    ).toEqual({ power: true, brightness: 70 });
  });

  it('kecerahan 0 membuat power mati', () => {
    expect(
      applyCommandToState({ power: true, brightness: 90 }, 'set_brightness', 0),
    ).toEqual({ power: false, brightness: 0 });
  });

  it('menyimpan warna dan suhu warna', () => {
    const warna = { r: 10, g: 20, b: 30 };
    expect(
      applyCommandToState({ power: true }, 'set_color', warna),
    ).toEqual({ power: true, color: warna });
    expect(
      applyCommandToState({ power: true }, 'set_temperature', 2700),
    ).toEqual({ power: true, temperature: 2700 });
  });

  it('tidak mengubah objek state asal (immutable)', () => {
    const asli = { power: false };
    const hasil = applyCommandToState(asli, 'turn_on');
    expect(asli).toEqual({ power: false });
    expect(hasil).not.toBe(asli);
  });

  it('melempar error untuk aksi tidak dikenal', () => {
    expect(() => applyCommandToState({}, 'terbang')).toThrow(
      'Aksi tidak dikenal: terbang',
    );
  });
});

describe('humanizeCommand', () => {
  it('membuat pesan menyalakan dan mematikan', () => {
    expect(humanizeCommand('Lampu Ruangan', 'turn_on')).toBe(
      'Lampu Ruangan dinyalakan.',
    );
    expect(humanizeCommand('Lampu Ruangan', 'turn_off')).toBe(
      'Lampu Ruangan dimatikan.',
    );
  });

  it('menyertakan nilai pada pesan kecerahan dan suhu', () => {
    expect(humanizeCommand('Lampu', 'set_brightness', 60)).toBe(
      'Lampu kecerahan 60%.',
    );
    // AC = derajat Celsius, lampu = Kelvin. Keduanya aksi terpisah (§4).
    expect(humanizeCommand('AC', 'set_temperature', 24)).toBe(
      'AC disetel ke 24°C.',
    );
    expect(humanizeCommand('Lampu', 'set_color_temperature', 3000)).toBe(
      'Lampu suhu warna 3000K.',
    );
  });

  it('pesan warna tidak menyertakan nilai RGB', () => {
    expect(humanizeCommand('Lampu', 'set_color', { r: 1, g: 2, b: 3 })).toBe(
      'Lampu warna diubah.',
    );
  });

  it('fallback untuk aksi tak dikenal', () => {
    expect(humanizeCommand('Lampu', 'entah')).toBe('Lampu diperbarui.');
  });
});

describe('DeviceCoreService', () => {
  const deviceInternal = {
    id: 'dev_internal',
    name: 'Lampu Virtual',
    homeId: 'home_1',
    integrationId: null,
    externalId: null,
    state: { power: false, brightness: 10 },
  };

  const deviceExternal = {
    id: 'dev_external',
    name: 'Relay Tasmota',
    homeId: 'home_1',
    integrationId: 'int_tasmota',
    externalId: 'tasmota_relay_01',
    state: { power: false, brightness: 10 },
  };

  let prisma: {
    integration: { findUnique: ReturnType<typeof vi.fn> };
    device: { update: ReturnType<typeof vi.fn> };
    activityLog: { create: ReturnType<typeof vi.fn> };
  };
  let gateway: { emitDeviceState: ReturnType<typeof vi.fn> };
  let mqtt: MqttAdapter;
  let tasmota: TasmotaAdapter;
  let manager: IntegrationManager;
  let service: DeviceCoreService;

  beforeEach(() => {
    prisma = {
      integration: { findUnique: vi.fn().mockResolvedValue(null) },
      device: { update: vi.fn().mockResolvedValue({}) },
      activityLog: { create: vi.fn().mockResolvedValue({}) },
    };
    gateway = { emitDeviceState: vi.fn() };
    // Adapter nyata mode mock, dengan connect/disconnect di-spy.
    mqtt = new MqttAdapter();
    tasmota = new TasmotaAdapter();
    vi.spyOn(mqtt, 'connect').mockResolvedValue(undefined);
    vi.spyOn(mqtt, 'disconnect').mockResolvedValue(undefined);
    vi.spyOn(tasmota, 'connect').mockResolvedValue(undefined);
    vi.spyOn(tasmota, 'disconnect').mockResolvedValue(undefined);
    manager = new IntegrationManager();
    service = new DeviceCoreService(
      prisma as unknown as PrismaService,
      manager,
      mqtt,
      tasmota,
      gateway as unknown as DeviceGateway,
    );
  });

  it('onModuleInit mendaftarkan kedua adapter lalu connect', async () => {
    await service.onModuleInit();

    expect(manager.list()).toEqual(['MQTT', 'TASMOTA']);
    expect(manager.get('MQTT')).toBe(mqtt);
    expect(manager.get('TASMOTA')).toBe(tasmota);
    expect(mqtt.connect).toHaveBeenCalled();
    expect(mqtt.connect).toHaveBeenCalled();
    expect(tasmota.connect).toHaveBeenCalled();
  });

  it('onModuleInit tetap berhasil saat satu integrasi gagal connect', async () => {
    // Broker MQTT mati adalah kondisi nyata (container belum siap / jaringan
    // putus); API harus tetap boot agar integrasi lain tetap bisa dipakai.
    vi.mocked(mqtt.connect).mockRejectedValue(
      new Error('connect ECONNREFUSED 172.19.0.3:1883'),
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(manager.list()).toEqual(['MQTT', 'TASMOTA']);
    expect(tasmota.connect).toHaveBeenCalled();
  });

  it('onModuleInit tetap berhasil saat integrasi melempar non-Error', async () => {
    vi.mocked(mqtt.connect).mockRejectedValue('bukan objek Error');

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(manager.get('MQTT')).toBe(mqtt);
    expect(manager.get('TASMOTA')).toBe(tasmota);
  });

  it('onModuleInit idempoten dan onModuleDestroy disconnect semuanya', async () => {
    await service.onModuleInit();
    await service.onModuleInit();
    expect(manager.list()).toEqual(['MQTT', 'TASMOTA']);

    await service.onModuleDestroy();
    expect(mqtt.disconnect).toHaveBeenCalled();
    expect(mqtt.disconnect).toHaveBeenCalled();
    expect(tasmota.disconnect).toHaveBeenCalled();
  });

  it('perangkat internal memakai applyCommandToState tanpa manager', async () => {
    const result = await service.executeCommand(deviceInternal, 'turn_on');

    expect(result).toEqual({
      deviceId: 'dev_internal',
      state: { power: true, brightness: 10 },
      message: 'Lampu Virtual dinyalakan.',
      external: false,
    });
    expect(prisma.integration.findUnique).not.toHaveBeenCalled();
  });

  it('menyimpan state baru via prisma.device.update', async () => {
    await service.executeCommand(deviceInternal, 'set_brightness', 80);

    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: 'dev_internal' },
      data: { state: { power: true, brightness: 80 } },
    });
  });

  it('mencatat aktivitas dengan pesan Bahasa Indonesia', async () => {
    await service.executeCommand(deviceInternal, 'turn_off');

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: {
        homeId: 'home_1',
        deviceId: 'dev_internal',
        level: 'INFO',
        message: 'Lampu Virtual dimatikan.',
      },
    });
  });

  it('menerbroadcast state ke gateway', async () => {
    await service.executeCommand(deviceInternal, 'turn_on');

    expect(gateway.emitDeviceState).toHaveBeenCalledWith('home_1', 'dev_internal', {
      power: true,
      brightness: 10,
    });
  });

  it('state null diperlakukan sebagai objek kosong', async () => {
    const result = await service.executeCommand(
      { ...deviceInternal, state: null },
      'turn_on',
    );
    expect(result.state).toEqual({ power: true });
  });

  it('perangkat eksternal dirutekan lewat manager sesuai tipe integration', async () => {
    prisma.integration.findUnique.mockResolvedValue({
      id: 'int_tasmota',
      type: 'TASMOTA',
      enabled: true,
    });
    const adapter = stubAdapter('TASMOTA');
    (adapter.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
      power: true,
      brightness: 77,
    });
    manager.register(adapter);

    const result = await service.executeCommand(deviceExternal, 'turn_on');

    expect(prisma.integration.findUnique).toHaveBeenCalledWith({
      where: { id: 'int_tasmota' },
    });
    expect(adapter.executeCommand).toHaveBeenCalledWith('tasmota_relay_01', {
      capability: 'power',
      value: true,
    });
    expect(result).toEqual({
      deviceId: 'dev_external',
      state: { power: true, brightness: 77 },
      message: 'Relay Tasmota dinyalakan.',
      external: true,
    });
  });

  it('state hasil adapter digabung dengan state lama perangkat', async () => {
    prisma.integration.findUnique.mockResolvedValue({
      id: 'int_tasmota',
      type: 'TASMOTA',
      enabled: true,
    });
    const adapter = stubAdapter('TASMOTA');
    (adapter.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
      power: true,
    });
    manager.register(adapter);

    const result = await service.executeCommand(deviceExternal, 'turn_on');
    expect(result.state).toEqual({ power: true, brightness: 10 });
  });

  it('integration nonaktif memakai jalur internal', async () => {
    prisma.integration.findUnique.mockResolvedValue({
      id: 'int_tasmota',
      type: 'TASMOTA',
      enabled: false,
    });
    const adapter = stubAdapter('TASMOTA');
    manager.register(adapter);

    const result = await service.executeCommand(deviceExternal, 'turn_on');
    expect(adapter.executeCommand).not.toHaveBeenCalled();
    expect(result.external).toBe(false);
    expect(result.state).toEqual({ power: true, brightness: 10 });
  });

  it('integration aktif tanpa externalId memakai jalur internal', async () => {
    prisma.integration.findUnique.mockResolvedValue({
      id: 'int_tasmota',
      type: 'TASMOTA',
      enabled: true,
    });
    const adapter = stubAdapter('TASMOTA');
    manager.register(adapter);

    const result = await service.executeCommand(
      { ...deviceExternal, externalId: null },
      'turn_on',
    );
    expect(adapter.executeCommand).not.toHaveBeenCalled();
    expect(result.external).toBe(false);
  });

  it('error dari adapter diteruskan ke pemanggil tanpa menyimpan state', async () => {
    prisma.integration.findUnique.mockResolvedValue({
      id: 'int_tasmota',
      type: 'SHELLY',
      enabled: true,
    });
    // Kegagalan adapter dipetakan ke kontrak error §13, bukan error mentah.
    await expect(
      service.executeCommand(deviceExternal, 'turn_on'),
    ).rejects.toMatchObject({
      code: 'INTEGRATION_NOT_AVAILABLE',
    });

    expect(prisma.device.update).not.toHaveBeenCalled();
    expect(gateway.emitDeviceState).not.toHaveBeenCalled();
  });

  it('discover melempar NotFoundException bila integration bukan milik user', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    (
      service as unknown as { prisma: { integration: { findFirst: unknown } } }
    ).prisma.integration.findFirst = findFirst;

    await expect(service.discover('user_1', 'int_other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'int_other', home: { ownerId: 'user_1' } },
    });
  });

  it('discover meneruskan ke manager berdasarkan tipe integration', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'int_1', type: 'TASMOTA' });
    (
      service as unknown as { prisma: { integration: { findFirst: unknown } } }
    ).prisma.integration.findFirst = findFirst;
    const adapter = stubAdapter('TASMOTA');
    (adapter.discoverDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tasmota_1',
        name: 'Tasmota 1',
        type: 'switch',
        capabilities: ['power'],
        state: {},
      },
    ]);
    manager.register(adapter);

    await expect(service.discover('user_1', 'int_1')).resolves.toEqual([
      {
        id: 'tasmota_1',
        name: 'Tasmota 1',
        type: 'switch',
        capabilities: ['power'],
        state: {},
      },
    ]);
  });
});
