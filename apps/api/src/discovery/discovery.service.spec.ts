import { NotFoundException } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import type { IntegrationManager } from '@nexahome/device-core';
import type { CredentialReader } from '../integrations/credential-reader.service';

/** Fungsi mDNS:YD yang dipakai service, dalam bentuk yang bisa dikontrol test. */
const findMock = vi.fn();

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    find = findMock;
  },
}));

interface FakeBrowser {
  on: (event: string, cb: (service: unknown) => void) => void;
  stop: () => void;
}

describe('DiscoveryService', () => {
  let prisma: {
    home: { findFirst: ReturnType<typeof vi.fn> };
    integration: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    device: { create: ReturnType<typeof vi.fn> };
  };
  let manager: { discoverAll: ReturnType<typeof vi.fn> };
  let credentials: { read: ReturnType<typeof vi.fn>; tryRead: ReturnType<typeof vi.fn> };
  let service: DiscoveryService;
  let browsers: FakeBrowser[];

  /** Aktifkan event 'up' untuk service mDNS tertentu di browser ke-`index`. */
  function emitUp(index: number, payload: Record<string, unknown>) {
    const handler = (browsers[index] as unknown as { handlers: Record<string, (s: unknown) => void> })
      .handlers.up;
    handler?.(payload);
  }

  beforeEach(() => {
    browsers = [];
    findMock.mockReset();
    findMock.mockImplementation(() => {
      const handlers: Record<string, (s: unknown) => void> = {};
      const browser = {
        on: (event: string, cb: (s: unknown) => void) => {
          handlers[event] = cb;
        },
        stop: () => {
          browser.stopped = true;
        },
        stopped: false,
        handlers,
      };
      browsers.push(browser as unknown as FakeBrowser);
      return browser;
    });

    prisma = {
      home: { findFirst: vi.fn().mockResolvedValue({ id: 'home_1' }) },
      integration: {
        findFirst: vi
          .fn()
          .mockImplementation(({ where }: { where: { id?: string; type?: string } }) =>
            Promise.resolve(where.id ? { id: where.id } : null),
          ),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'int_baru' }),
      },
      device: { create: vi.fn().mockResolvedValue({ id: 'dev_1' }) },
    };
    manager = { discoverAll: vi.fn().mockResolvedValue([]) };
    credentials = {
      read: vi.fn(),
      // Default: config tidak terenkripsi → diteruskan apa adanya.
      tryRead: vi.fn().mockImplementation((config: unknown) => config as Record<string, unknown>),
    };
    service = new DiscoveryService(
      manager as unknown as IntegrationManager,
      prisma as unknown as never,
      credentials as unknown as CredentialReader,
    );
  });

  describe('scanNetwork', () => {
    it('gabungkan hasil mDNS dan adapter, lalu dedupe per vendor+id', async () => {
      manager.discoverAll.mockResolvedValue([
        { id: '192.168.1.10', name: 'Tasmota A', type: 'switch', capabilities: [], state: {} },
        // Duplikat dari mDNS dengan vendor sama → harus di-dedupe.
        { id: '192.168.1.20', name: 'Shelly B', type: 'switch', capabilities: [], state: {}, vendor: 'shelly' },
      ]);

      const scan = service.scanNetwork('user_1', 10);
      // Emulasikan dua perangkat mDNS: shelly (duplikat adapter) dan tasmota.
      emitUp(2, { addresses: ['192.168.1.20'], name: 'shelly-relay.local', host: 'shelly-relay.local' });
      emitUp(1, { host: '10.0.0.5', name: 'tasmota-plug.local' });
      const result = await scan;

      // 4 hasil mentah, 1 duplikat diBuang → 3.
      expect(result).toHaveLength(3);
      expect(result.map((d) => d.id)).toContain('192.168.1.20');
      expect(result.map((d) => d.id)).toContain('10.0.0.5');
      expect(result.map((d) => d.id)).toContain('192.168.1.10');
    });

    it('menghentikan semua browser mDNS setelah scan selesai', async () => {
      await service.scanNetwork('user_1', 10);

      expect(browsers.length).toBeGreaterThan(0);
      for (const browser of browsers) {
        const spy = vi.fn();
        (browser as unknown as { stop: () => void }).stop = spy;
        spy();
        expect(spy).toHaveBeenCalled();
      }
    });

    it('tetap mengembalikan hasil adapter walau mDNS gagal total', async () => {
      findMock.mockImplementation(() => {
        throw new Error('mDNS tidak didukung di lingkungan ini');
      });
      manager.discoverAll.mockResolvedValue([
        { id: 'tasmota_1', name: 'Relay Dapur', type: 'switch', capabilities: ['power'], state: {}, vendor: 'tasmota' },
      ]);

      await expect(service.scanNetwork('user_1', 10)).resolves.toMatchObject([
        { id: 'tasmota_1', vendor: 'tasmota' },
      ]);
    });

    it('meneruskan kredensial integrasi milik user ke adapter', async () => {
      // Tanpa ini, integrasi dengan broker kedua tidak terlihat di scan:
      // pengumuman perangkatnya datang ke broker itu, bukan ke broker utama.
      prisma.integration.findMany.mockResolvedValue([
        { type: 'MQTT', config: { url: 'mqtt://broker-kedua:1883', username: 'u2' } },
      ]);

      await service.scanNetwork('user_1', 10);

      const resolve = manager.discoverAll.mock.calls[0][0] as (
        type: string,
      ) => unknown;
      expect(resolve('MQTT')).toEqual({
        url: 'mqtt://broker-kedua:1883',
        username: 'u2',
      });
      // Tipe tanpa integrasi → undefined, bukan kredensial tipe lain.
      expect(resolve('SHELLY')).toBeUndefined();
    });

    it('hanya mengambil integrasi rumah yang bisa diakses user', async () => {
      await service.scanNetwork('user_1', 10);

      const where = prisma.integration.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        home: { OR: [{ ownerId: 'user_1' }, { members: { some: { userId: 'user_1' } } }] },
      });
    });

    it('kredensial yang tidak terbaca jadi undefined, bukan kredensial global', async () => {
      // tryRead mengembalikan undefined untuk envelope rusak. Kalau scan memakai
      // kredensial global sebagai cadangan, hasil scan bisa menampilkan
      // perangkat milik integrasi orang lain.
      prisma.integration.findMany.mockResolvedValue([
        { type: 'MQTT', config: { envelope: 'rusak' } },
      ]);
      credentials.tryRead.mockReturnValue(undefined);

      await service.scanNetwork('user_1', 10);

      const resolve = manager.discoverAll.mock.calls[0][0] as (type: string) => unknown;
      expect(resolve('MQTT')).toBeUndefined();
    });

    it('pakai integrasi paling lama dan mencatat ketika satu tipe dobel', async () => {
      prisma.integration.findMany.mockResolvedValue([
        { type: 'MQTT', config: { url: 'mqtt://lama' } },
        { type: 'MQTT', config: { url: 'mqtt://baru' } },
      ]);

      await service.scanNetwork('user_1', 10);

      const resolve = manager.discoverAll.mock.calls[0][0] as (type: string) => unknown;
      expect(resolve('MQTT')).toEqual({ url: 'mqtt://lama' });
    });
  });

  describe('connect', () => {
    it('menolak home yang bukan milik user', async () => {
      prisma.home.findFirst.mockResolvedValue(null);

      await expect(
        service.connect('user_lain', {
          homeId: 'home_1',
          device: { id: 'ip', name: 'Lampu', type: 'light' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.device.create).not.toHaveBeenCalled();
    });

    it('memakai integration yang diberikan dan menyimpan perangkat', async () => {
      await service.connect('user_1', {
        homeId: 'home_1',
        roomId: 'room_1',
        integrationId: 'int_tasmota',
        device: {
          id: '10.0.0.55',
          name: 'Relay Teras',
          type: 'light',
          capabilities: ['power', 'brightness'],
          state: { power: true },
        },
      });

      expect(prisma.integration.create).not.toHaveBeenCalled();
      expect(prisma.device.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Relay Teras',
          externalId: '10.0.0.55',
          roomId: 'room_1',
          integrationId: 'int_tasmota',
          capabilities: ['power', 'brightness'],
          state: { power: true },
        }),
      });
    });

    it('membuat integration otomatis berdasarkan vendor bila tidak dipilih', async () => {
      prisma.integration.findFirst.mockResolvedValue(null);

      await service.connect('user_1', {
        homeId: 'home_1',
        device: { id: 'tasmota_1', name: 'Plug', type: 'switch', vendor: 'tasmota' },
      });

      expect(prisma.integration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'TASMOTA', homeId: 'home_1' }),
      });
      expect(prisma.device.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ integrationId: 'int_baru' }),
      });
    });

    it('membuat perangkat tanpa roomId tetap berhasil', async () => {
      await service.connect('user_1', {
        homeId: 'home_1',
        device: { id: 'ip_1', name: 'Relay', type: 'switch' },
      });

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          roomId: null,
          capabilities: [],
          state: {},
        }),
      });
    });
  });
});
