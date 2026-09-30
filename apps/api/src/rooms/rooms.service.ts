import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  accessibleHomeFilter,
  accessibleHomeWhere,
} from '../homes/home-access';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, homeId?: string) {
    if (homeId) {
      await this.assertHomeOwned(userId, homeId);
      return this.prisma.room.findMany({
        where: { homeId },
        include: { _count: { select: { devices: true } } },
      });
    }
    return this.prisma.room.findMany({
      where: { home: accessibleHomeFilter(userId) },
      include: { _count: { select: { devices: true } } },
    });
  }

  async findOne(userId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, home: accessibleHomeFilter(userId) },
      include: { devices: true },
    });
    if (!room) throw new NotFoundException('Ruangan tidak ditemukan.');
    return room;
  }

  async create(userId: string, dto: CreateRoomDto) {
    await this.assertHomeOwned(userId, dto.homeId);
    return this.prisma.room.create({ data: dto });
  }

  async update(userId: string, id: string, dto: UpdateRoomDto) {
    await this.assertRoomOwned(userId, id);
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.assertRoomOwned(userId, id);
    return this.prisma.room.delete({ where: { id } });
  }

  private async assertHomeOwned(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: accessibleHomeWhere(userId, homeId),
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }

  private async assertRoomOwned(userId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, home: accessibleHomeFilter(userId) },
    });
    if (!room) throw new NotFoundException('Ruangan tidak ditemukan.');
    return room;
  }
}
