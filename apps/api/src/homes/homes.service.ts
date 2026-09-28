import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';

@Injectable()
export class HomesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ownerId: string) {
    return this.prisma.home.findMany({
      where: { ownerId },
      include: { _count: { select: { rooms: true, devices: true } } },
    });
  }

  async findOne(ownerId: string, id: string) {
    const home = await this.prisma.home.findFirst({
      where: { id, ownerId },
      include: {
        rooms: true,
        devices: true,
        integrations: true,
      },
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }

  create(ownerId: string, dto: CreateHomeDto) {
    return this.prisma.home.create({ data: { name: dto.name, ownerId } });
  }

  async update(ownerId: string, id: string, dto: UpdateHomeDto) {
    await this.ensureOwned(ownerId, id);
    return this.prisma.home.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string) {
    await this.ensureOwned(ownerId, id);
    return this.prisma.home.delete({ where: { id } });
  }

  private async ensureOwned(ownerId: string, id: string) {
    const home = await this.prisma.home.findFirst({
      where: { id, ownerId },
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }
}
