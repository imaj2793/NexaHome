import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, homeId?: string, limit = 50) {
    if (homeId) {
      const home = await this.prisma.home.findFirst({
        where: { id: homeId, ownerId: userId },
      });
      if (!home) throw new NotFoundException('Home tidak ditemukan.');
    }

    return this.prisma.activityLog.findMany({
      where: {
        home: { ownerId: userId },
        ...(homeId ? { homeId } : {}),
      },
      include: { device: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
