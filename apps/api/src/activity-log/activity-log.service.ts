import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { accessibleHomeFilter, accessibleHomeWhere } from '../homes/home-access';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, homeId?: string, limit = 50) {
    if (homeId) {
      const home = await this.prisma.home.findFirst({
        where: accessibleHomeWhere(userId, homeId),
      });
      if (!home) throw new NotFoundException('Home tidak ditemukan.');
    }

    return this.prisma.activityLog.findMany({
      where: {
        home: accessibleHomeFilter(userId),
        ...(homeId ? { homeId } : {}),
      },
      include: { device: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
