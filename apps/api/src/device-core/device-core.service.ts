import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  applyCommandToState,
  humanizeCommand,
  IntegrationManager,
  toIntegrationCommand,
} from '@nexahome/device-core';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceGateway } from './device.gateway';

/** Bentuk device minimal yang dibutuhkan untuk mengeksekusi perintah. */
export interface ExecutableDevice {
  id: string;
  name: string;
  homeId: string;
  integrationId: string | null;
  externalId: string | null;
  state: unknown;
}

export interface CommandResult {
  deviceId: string;
  state: Record<string, unknown>;
  message: string;
  external: boolean;
}

/**
 * Device Core (blueprint §7, §8, §14). Menjembatani perintah user/AI ke
 * integration yang tepat — Nexa/AI tidak tahu cara kerja perangkat, hanya
 * capability + state. Perintah dirutekan lewat IntegrationManager.
 */
@Injectable()
export class DeviceCoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: IntegrationManager,
    private readonly mqtt: MqttAdapter,
    private readonly tasmota: TasmotaAdapter,
    private readonly gateway: DeviceGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    this.manager.register(this.mqtt);
    this.manager.register(this.tasmota);
    // Integrasi yang gagal connect (mis. broker MQTT mati) tidak boleh
    // menggagalkan boot API: perangkat dari integrasi lain harus tetap
    // bisa dipakai, dan client mqtt.js otomatis mencoba reconnect.
    await this.connectSafely('MQTT', this.mqtt);
    await this.connectSafely('Tasmota', this.tasmota);
  }

  private async connectSafely(
    name: string,
    adapter: { connect: () => Promise<void> },
  ): Promise<void> {
    try {
      await adapter.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Integrasi ${name} gagal connect: ${message}. ` +
          'API tetap jalan; integrasi lain tetap bisa dipakai.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.mqtt.disconnect();
    await this.tasmota.disconnect();
  }

  async executeCommand(
    device: ExecutableDevice,
    action: string,
    value?: unknown,
  ): Promise<CommandResult> {
    const integration = device.integrationId
      ? await this.prisma.integration.findUnique({
          where: { id: device.integrationId },
        })
      : null;

    const current = (device.state ?? {}) as Record<string, unknown>;
    let nextState: Record<string, unknown>;
    let external = false;

    if (integration && integration.enabled && device.externalId) {
      const command = toIntegrationCommand(action, value);
      const result = await this.manager.executeCommand(
        integration.type,
        device.externalId,
        command,
      );
      nextState = { ...current, ...result };
      external = true;
    } else {
      nextState = applyCommandToState(current, action, value);
    }

    const message = humanizeCommand(device.name, action, value);

    await this.prisma.device.update({
      where: { id: device.id },
      data: { state: nextState as object },
    });
    await this.prisma.activityLog.create({
      data: {
        homeId: device.homeId,
        deviceId: device.id,
        level: 'INFO',
        message,
      },
    });

    this.gateway.emitDeviceState(device.homeId, device.id, nextState);

    return { deviceId: device.id, state: nextState, message, external };
  }

  async discover(userId: string, integrationId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { id: integrationId, home: { ownerId: userId } },
    });
    if (!integration) {
      throw new NotFoundException('Integration tidak ditemukan.');
    }
    return this.manager.discover(integration.type);
  }
}
