import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, homeId?: string) {
    if (homeId) await this.assertHomeOwned(userId, homeId);
    return this.prisma.integration.findMany({
      where: {
        home: { ownerId: userId },
        ...(homeId ? { homeId } : {}),
      },
    });
  }

  async create(userId: string, dto: CreateIntegrationDto) {
    await this.assertHomeOwned(userId, dto.homeId);
    return this.prisma.integration.create({
      data: {
        name: dto.name,
        type: dto.type,
        homeId: dto.homeId,
        enabled: dto.enabled ?? true,
        config: (dto.config ?? {}) as object,
      },
    });
  }

  private async assertHomeOwned(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ownerId: userId },
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }
}
