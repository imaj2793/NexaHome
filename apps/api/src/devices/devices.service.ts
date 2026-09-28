import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceCommandDto } from './dto/device-command.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, homeId?: string, roomId?: string) {
    if (homeId) await this.assertHomeOwned(userId, homeId);
    return this.prisma.device.findMany({
      where: {
        home: { ownerId: userId },
        ...(homeId ? { homeId } : {}),
        ...(roomId ? { roomId } : {}),
      },
      include: { room: true, integration: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, home: { ownerId: userId } },
      include: { room: true, integration: true },
    });
    if (!device) throw new NotFoundException('Perangkat tidak ditemukan.');
    return device;
  }

  async create(userId: string, dto: CreateDeviceDto) {
    await this.assertHomeOwned(userId, dto.homeId);
    return this.prisma.device.create({
      data: {
        name: dto.name,
        type: dto.type,
        homeId: dto.homeId,
        roomId: dto.roomId ?? null,
        integrationId: dto.integrationId ?? null,
        capabilities: dto.capabilities ?? [],
        state: (dto.state ?? {}) as object,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateDeviceDto) {
    await this.assertDeviceOwned(userId, id);
    return this.prisma.device.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.roomId !== undefined ? { roomId: dto.roomId } : {}),
        ...(dto.capabilities !== undefined
          ? { capabilities: dto.capabilities }
          : {}),
        ...(dto.state !== undefined ? { state: dto.state as object } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertDeviceOwned(userId, id);
    return this.prisma.device.delete({ where: { id } });
  }

  async command(userId: string, id: string, dto: DeviceCommandDto) {
    const device = await this.assertDeviceOwned(userId, id);
    const current = (device.state ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...current };
    let message: string;

    switch (dto.action) {
      case 'turn_on':
        next.power = true;
        message = `${device.name} dinyalakan.`;
        break;
      case 'turn_off':
        next.power = false;
        message = `${device.name} dimatikan.`;
        break;
      case 'set_brightness':
        next.brightness = dto.value;
        next.power = (dto.value ?? 0) > 0;
        message = `${device.name} kecerahan ${dto.value}%.`;
        break;
      default:
        throw new BadRequestException(`Command tidak dikenal: ${dto.action}`);
    }

    await this.prisma.device.update({
      where: { id },
      data: { state: next as object },
    });
    await this.prisma.activityLog.create({
      data: {
        homeId: device.homeId,
        deviceId: device.id,
        level: 'INFO',
        message,
      },
    });

    return { deviceId: id, state: next, message };
  }

  private async assertHomeOwned(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ownerId: userId },
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }

  private async assertDeviceOwned(userId: string, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, home: { ownerId: userId } },
    });
    if (!device) throw new NotFoundException('Perangkat tidak ditemukan.');
    return device;
  }
}
