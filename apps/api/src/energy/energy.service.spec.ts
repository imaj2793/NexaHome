import { accessibleHomeFilter } from '../homes/home-access';
import { EnergyService } from './energy.service';
import type { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  device: { findMany: vi.fn() },
});

const device = (id: string, name: string, type: string, state: unknown) => ({
  id,
  name,
  type,
  homeId: 'home_1',
  state,
});

describe('EnergyService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EnergyService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    service = new EnergyService(prisma as unknown as PrismaService);
  });

  it('summary hanya menjumlahkan perangkat dengan state power true', async () => {
    prisma.device.findMany.mockResolvedValue([
      device('dev_1', 'Lampu', 'light', { power: true }),
      device('dev_2', 'Kipas', 'fan', { power: false }),
      device('dev_3', 'TV', 'tv', { power: true }),
    ] as never);

    const res = await service.summary('usr_1');

    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: { home: accessibleHomeFilter('usr_1') },
    });
    expect(res.activeCount).toBe(2);
    expect(res.totalWatts).toBe(130);
    expect(res.devices.map((d) => d.id)).toEqual(['dev_1', 'dev_3']);
  });

  it('menggunakan wattage default untuk tipe yang tidak dikenal', async () => {
    prisma.device.findMany.mockResolvedValue([
      device('dev_1', 'Sensor', 'sensor', { power: true }),
    ] as never);

    const res = await service.summary('usr_1');

    expect(res.devices).toEqual([
      { id: 'dev_1', name: 'Sensor', type: 'sensor', watts: 50 },
    ]);
    expect(res.totalWatts).toBe(50);
  });

  it('menghitung kWh harian dari total watt', async () => {
    prisma.device.findMany.mockResolvedValue([
      device('dev_1', 'AC', 'ac', { power: true }),
      device('dev_2', 'Heater', 'heater', { power: true }),
    ] as never);

    const res = await service.summary('usr_1');

    expect(res.totalWatts).toBe(2500);
    expect(res.estimatedKwhPerDay).toBe(60);
  });

  it('mengabaikan perangkat tanpa field power atau dengan power non-boolean', async () => {
    prisma.device.findMany.mockResolvedValue([
      device('dev_1', 'Kipas', 'fan', {}),
      device('dev_2', 'TV', 'tv', { power: 'true' }),
      device('dev_3', 'Lampu', 'light', { power: false }),
    ] as never);

    const res = await service.summary('usr_1');

    expect(res.activeCount).toBe(0);
    expect(res.totalWatts).toBe(0);
    expect(res.estimatedKwhPerDay).toBe(0);
    expect(res.devices).toEqual([]);
  });

  // Perilaku saat ini: summary tidak menangani null state. Kolom `state`
  // nullable, jadi jalur ini bisa terjadi di produksi.
  it('melempar error bila ada perangkat dengan state null', async () => {
    prisma.device.findMany.mockResolvedValue([
      device('dev_1', 'Lampu', 'light', null),
    ] as never);

    await expect(service.summary('usr_1')).rejects.toThrow(TypeError);
  });

  it('mengembalikan ringkasan nol saat tidak ada perangkat aktif', async () => {
    prisma.device.findMany.mockResolvedValue([] as never);

    await expect(service.summary('usr_1')).resolves.toEqual({
      totalWatts: 0,
      activeCount: 0,
      estimatedKwhPerDay: 0,
      devices: [],
    });
  });

  it('membulatkan kWh ke dua desimal', async () => {
    prisma.device.findMany.mockResolvedValue([
      device('dev_1', 'Lampu', 'light', { power: true }),
    ] as never);

    const res = await service.summary('usr_1');

    expect(res.totalWatts).toBe(10);
    expect(res.estimatedKwhPerDay).toBe(0.24);
  });
});
