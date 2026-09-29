import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Estimasi konsumsi daya (watt) per tipe perangkat — untuk monitoring energi. */
const WATTAGE: Record<string, number> = {
  light: 10,
  ac: 1000,
  tv: 120,
  fan: 60,
  heater: 1500,
  default: 50,
};

@Injectable()
export class EnergyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ringkasan pemakaian energi berdasarkan perangkat yang sedang aktif. */
  async summary(userId: string) {
    const devices = await this.prisma.device.findMany({
      where: { home: { ownerId: userId } },
    });

    const active = devices.filter(
      (d) => (d.state as { power?: boolean }).power === true,
    );
    const items = active.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      watts: WATTAGE[d.type] ?? WATTAGE.default,
    }));

    const totalWatts = items.reduce((sum, d) => sum + d.watts, 0);

    return {
      totalWatts,
      activeCount: items.length,
      estimatedKwhPerDay: Number(((totalWatts * 24) / 1000).toFixed(2)),
      devices: items,
    };
  }
}
