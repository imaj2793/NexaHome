import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { accessibleHomeFilter } from './home-access';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';

/** Bentuk anggota rumah yang dikirim ke klien (tanpa kredensial user). */
export interface HomeMemberView {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
}

@Injectable()
export class HomesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rumah milik user + rumah yang dianggotainya. */
  findAll(ownerId: string) {
    return this.prisma.home.findMany({
      where: accessibleHomeFilter(ownerId),
      include: {
        _count: { select: { rooms: true, devices: true } },
        members: { select: { userId: true, role: true } },
      },
    });
  }

  async findOne(ownerId: string, id: string) {
    const home = await this.prisma.home.findFirst({
      where: { id, OR: [{ ownerId }, { members: { some: { userId: ownerId } } }] },
      include: {
        rooms: true,
        devices: true,
        integrations: true,
      },
    });
    if (!home) throw new ApiError(ErrorCode.NOT_FOUND, 'Home tidak ditemukan.');
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

  /** Daftar anggota rumah. Hanya pemilik dan anggota boleh melihat. */
  async listMembers(userId: string, homeId: string) {
    await this.assertAccessible(userId, homeId);
    const members = await this.prisma.homeMember.findMany({
      where: { homeId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map<HomeMemberView>((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      createdAt: m.createdAt,
    }));
  }

  /** Tambahkan anggota berdasarkan email akun yang sudah terdaftar. */
  async addMember(userId: string, homeId: string, email: string) {
    await this.ensureOwned(userId, homeId);
    const normalized = email.trim().toLowerCase();
    const target = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true },
    });
    if (!target) {
      throw new ApiError(
        ErrorCode.VALIDATION_FAILED,
        'Tidak ada akun dengan email tersebut.',
      );
    }
    if (target.id === userId) {
      throw new ApiError(
        ErrorCode.VALIDATION_FAILED,
        'Kamu sudah pemilik rumah ini.',
      );
    }
    const existing = await this.prisma.homeMember.findUnique({
      where: { homeId_userId: { homeId, userId: target.id } },
      select: { id: true },
    });
    if (existing) return this.listMembers(userId, homeId);

    await this.prisma.homeMember.create({ data: { homeId, userId: target.id } });
    return this.listMembers(userId, homeId);
  }

  /** Keluarkan anggota (pemilik tidak bisa dikeluarkan lewat cara ini). */
  async removeMember(userId: string, homeId: string, memberId: string) {
    await this.ensureOwned(userId, homeId);
    await this.prisma.homeMember.delete({ where: { id: memberId, homeId } });
    return this.listMembers(userId, homeId);
  }

  private async ensureOwned(ownerId: string, id: string) {
    const home = await this.prisma.home.findFirst({
      where: { id, ownerId },
    });
    if (!home) throw new ApiError(ErrorCode.NOT_FOUND, 'Home tidak ditemukan.');
    return home;
  }

  private async assertAccessible(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: {
        id: homeId,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    });
    if (!home) throw new ApiError(ErrorCode.NOT_FOUND, 'Home tidak ditemukan.');
    return home;
  }
}
