import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!n) throw new NotFoundException('Notifikasi tidak ditemukan.');
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async remove(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!n) throw new NotFoundException('Notifikasi tidak ditemukan.');
    return this.prisma.notification.delete({ where: { id } });
  }

  /** Buat notifikasi — dipakai internal (mis. automation engine). */
  async notify(userId: string, title: string, body?: string) {
    return this.prisma.notification.create({ data: { userId, title, body } });
  }
}
