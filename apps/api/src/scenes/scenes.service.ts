import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommandResult,
  DeviceCoreService,
  ExecutableDevice,
} from '../device-core/device-core.service';
import { CreateSceneDto } from './dto/create-scene.dto';
import { UpdateSceneDto } from './dto/update-scene.dto';

type ActivateResult = CommandResult | { deviceId: string; error: string };

@Injectable()
export class ScenesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceCore: DeviceCoreService,
  ) {}

  async list(userId: string, homeId?: string) {
    if (homeId) await this.assertHomeOwned(userId, homeId);
    return this.prisma.scene.findMany({
      where: {
        home: { ownerId: userId },
        ...(homeId ? { homeId } : {}),
      },
      include: { actions: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(userId: string, id: string) {
    const scene = await this.prisma.scene.findFirst({
      where: { id, home: { ownerId: userId } },
      include: { actions: true },
    });
    if (!scene) throw new NotFoundException('Scene tidak ditemukan.');
    return scene;
  }

  async create(userId: string, dto: CreateSceneDto) {
    await this.assertHomeOwned(userId, dto.homeId);
    return this.prisma.scene.create({
      data: {
        name: dto.name,
        homeId: dto.homeId,
        actions: {
          create: dto.actions.map((a) => ({
            deviceId: a.deviceId,
            action: a.action as object,
          })),
        },
      },
      include: { actions: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateSceneDto) {
    await this.assertSceneOwned(userId, id);
    if (dto.homeId !== undefined) {
      await this.assertHomeOwned(userId, dto.homeId);
    }
    return this.prisma.scene.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.homeId !== undefined ? { homeId: dto.homeId } : {}),
        ...(dto.actions !== undefined
          ? {
              actions: {
                deleteMany: {},
                create: dto.actions.map((a) => ({
                  deviceId: a.deviceId,
                  action: a.action as object,
                })),
              },
            }
          : {}),
      },
      include: { actions: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertSceneOwned(userId, id);
    return this.prisma.scene.delete({ where: { id } });
  }

  async activate(userId: string, id: string) {
    const scene = await this.prisma.scene.findFirst({
      where: { id, home: { ownerId: userId } },
      include: { actions: true },
    });
    if (!scene) throw new NotFoundException('Scene tidak ditemukan.');

    const results: ActivateResult[] = [];

    for (const action of scene.actions) {
      const device = await this.prisma.device.findFirst({
        where: { id: action.deviceId, home: { ownerId: userId } },
      });
      if (!device) {
        results.push({
          deviceId: action.deviceId,
          error: 'Perangkat tidak ditemukan.',
        });
        continue;
      }

      const executable = device as ExecutableDevice;
      const payload = action.action as { action: string; value?: unknown };
      const result = await this.deviceCore.executeCommand(
        executable,
        payload.action,
        payload.value,
      );
      results.push(result);
    }

    return { message: 'Scene berhasil dijalankan.', results };
  }

  private async assertHomeOwned(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ownerId: userId },
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }

  private async assertSceneOwned(userId: string, id: string) {
    const scene = await this.prisma.scene.findFirst({
      where: { id, home: { ownerId: userId } },
    });
    if (!scene) throw new NotFoundException('Scene tidak ditemukan.');
    return scene;
  }
}
