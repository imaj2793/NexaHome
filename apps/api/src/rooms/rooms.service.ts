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
      await this.assertHomeAccessible(userId, homeId);
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
    await this.assertHomeAccessible(userId, dto.homeId);
    return this.prisma.room.create({ data: dto });
  }

  async update(userId: string, id: string, dto: UpdateRoomDto) {
    await this.assertRoomAccessible(userId, id);
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.assertRoomAccessible(userId, id);
    return this.prisma.room.delete({ where: { id } });
  }

  /**
   * Rumah harus milik user ATAU dianggotai user.
   *
   * Namanya "accessible", bukan "owned": anggota rumah boleh membuat dan
   * mengubah ruangan (keputusan produk di `docs/authentication.md`), jadi
   * filter di sini memang `accessibleHomeWhere`, bukan `ownerId`.
   */
  private async assertHomeAccessible(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: accessibleHomeWhere(userId, homeId),
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }

  /** Sama seperti di atas: ruangan di rumah yang bisa diakses user. */
  private async assertRoomAccessible(userId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, home: accessibleHomeFilter(userId) },
    });
    if (!room) throw new NotFoundException('Ruangan tidak ditemukan.');
    return room;
  }
}
