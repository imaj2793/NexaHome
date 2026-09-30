import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  accessibleHomeFilter,
  accessibleHomeWhere,
} from '../homes/home-access';
import { DeviceCoreService } from '../device-core/device-core.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceCommandDto } from './dto/device-command.dto';

const VALID_ACTIONS = [
  'turn_on',
  'turn_off',
  'set_brightness',
  'set_color',
  'set_temperature',
  'set_color_temperature',
];

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceCore: DeviceCoreService,
  ) {}

  async findAll(userId: string, homeId?: string, roomId?: string) {
    if (homeId) await this.assertHomeOwned(userId, homeId);
    return this.prisma.device.findMany({
      where: {
        home: accessibleHomeFilter(userId),
        ...(homeId ? { homeId } : {}),
        ...(roomId ? { roomId } : {}),
      },
      include: { room: true, integration: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, home: accessibleHomeFilter(userId) },
      include: { room: true, integration: true },
    });
    if (!device) throw new NotFoundException('Perangkat tidak ditemukan.');
    return device;
  }

  async create(userId: string, dto: CreateDeviceDto) {
    const home = await this.assertHomeOwned(userId, dto.homeId);
    await this.assertRoomInHome(dto.roomId, home.id);
    return this.prisma.device.create({
      data: {
        name: dto.name,
        type: dto.type,
        homeId: dto.homeId,
        roomId: dto.roomId ?? null,
        integrationId: dto.integrationId ?? null,
        externalId: dto.externalId ?? null,
        capabilities: dto.capabilities ?? [],
        state: (dto.state ?? {}) as object,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateDeviceDto) {
    const device = await this.assertDeviceOwned(userId, id);
    // `roomId` harus milik rumah yang sama. Tanpa cek ini, perangkat bisa
    // diarahkan ke room rumah orang lain; karena respons device menyertakan
    // `room`, nama room milik orang lain ikut terbaca di sini.
    await this.assertRoomInHome(dto.roomId, device.homeId);
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
    if (!VALID_ACTIONS.includes(dto.action)) {
      throw new BadRequestException(`Command tidak dikenal: ${dto.action}`);
    }

    const device = await this.prisma.device.findFirst({
      where: { id, home: accessibleHomeFilter(userId) },
      include: { integration: true },
    });
    if (!device) throw new NotFoundException('Perangkat tidak ditemukan.');

    return this.deviceCore.executeCommand(device, dto.action, dto.value);
  }

  private async assertHomeOwned(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: accessibleHomeWhere(userId, homeId),
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }

  /**
   * Pastikan room (kalau ada) berada di rumah yang sama dengan perangkat.
   *
   * Room di rumah lain ditolak dengan 404, sama seperti sumber daya milik
   * rumah orang lain: Existence-nya tidak perlu dikonfirmasi.
   */
  private async assertRoomInHome(
    roomId: string | null | undefined,
    homeId: string,
  ): Promise<void> {
    if (roomId === undefined || roomId === null) return;
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, homeId },
      select: { id: true },
    });
    if (!room) throw new NotFoundException('Room tidak ditemukan.');
  }

  private async assertDeviceOwned(userId: string, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, home: accessibleHomeFilter(userId) },
    });
    if (!device) throw new NotFoundException('Perangkat tidak ditemukan.');
    return device;
  }
}
