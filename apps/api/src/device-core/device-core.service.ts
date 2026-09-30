import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  type AdapterCredentials,
  applyCommandToState,
  humanizeCommand,
  IntegrationManager,
  toIntegrationCommand,
} from '@nexahome/device-core';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/errors/api-error';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCapabilitySupported,
  assertValueInRange,
  toAdapterError,
} from './command-errors';
import {
  decryptCredentials,
  isCredentialEnvelope,
} from '../integrations/credential-crypto';
import { DeviceGateway } from './device.gateway';

/** Bentuk device minimal yang dibutuhkan untuk mengeksekusi perintah. */
export interface ExecutableDevice {
  id: string;
  name: string;
  homeId: string;
  integrationId: string | null;
  externalId: string | null;
  capabilities?: readonly string[] | null;
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
    private readonly config: ConfigService,
  ) {}

  /** Passphrase enkripsi kredensial; sama dengan yang dipakai IntegrationsService. */
  private passphrase(): string {
    return this.config.get<string>('INTEGRATION_CREDENTIALS_KEY') ?? '';
  }

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

  /**
   * Kredensial integrasi dalam bentuk yang bisa dibaca adapter.
   *
   * `Integration.config` disimpan terenkripsi, jadi harus diurdai di sini —
   * satu-satunya tempat di server yang berubah dari ciphertext menjadi nilai
   * asli, dan hasilnya langsung dipakai adapter tanpa pernah masuk respons.
   *
   * Config lama yang belum dienkripsi diteruskan apa adanya supaya integrasi
   * yang sudah jalan tidak mati setelah upgrade.
   */
  private credentialsOf(config: unknown): AdapterCredentials | undefined {
    if (!config || typeof config !== 'object') return undefined;
    if (!isCredentialEnvelope(config)) {
      return config as AdapterCredentials;
    }
    try {
      return decryptCredentials(config, this.passphrase());
    } catch (error) {
      // Gagal baca = gagal dijalankan. Melanjutkan tanpa kredensial akan
      // mengirim perintah ke broker atau perangkat global, yaitu
      // perangkat yang berbeda dari yang diminta pengguna.
      this.logger.error(
        `Kredensial integrasi tidak bisa dibaca: ${(error as Error).message}`,
      );
      throw new BadRequestException({
        code: 'INTEGRATION_CREDENTIALS_INVALID',
        message:
          'Kredensial integrasi tidak bisa dibaca. Periksa ulang konfigurasi integration.',
      });
    }
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

    // Kapabilitas divalidasi SEBELUM menyentuh perangkat (spec §2 aturan 10).
    // `toIntegrationCommand` juga menolak aksi yang tidak dikenal.
    let command;
    try {
      command = toIntegrationCommand(action, value);
    } catch {
      throw new ApiError(
        ErrorCode.INVALID_COMMAND_VALUE,
        `Perintah "${action}" tidak dikenali untuk ${device.name}.`,
      );
    }
    assertCapabilitySupported(device.capabilities, command.capability, device.name);
    assertValueInRange(command.capability, command.value);

    // `online: false` berarti laporan perangkat terakhir (atau adapter) sudah
    // menyatakan perangkat mati; jangan kirim perintah yang pasti gagal.
    if (current.online === false) {
      throw new ApiError(
        ErrorCode.DEVICE_OFFLINE,
        `${device.name} sedang tidak tersedia.`,
        { device: device.name },
      );
    }

    let nextState: Record<string, unknown>;
    let external = false;

    if (integration && integration.enabled && device.externalId) {
      // Di luar try: kegagalan baca kredensial adalah masalah konfigurasi,
      // bukan kegagalan adapter, jadi tidak boleh diterjemahkan jadi
      // INTEGRATION_COMMAND_FAILED yang menutupi penyebabnya.
      const credentials = this.credentialsOf(integration.config);
      try {
        const result = await this.manager.executeCommand(
          integration.type,
          device.externalId,
          command,
          credentials,
        );
        nextState = { ...current, ...result };
        external = true;
      } catch (error) {
        this.logger.warn(
          `Perintah ${action} untuk ${device.name} gagal: ` +
            (error instanceof Error ? error.message : String(error)),
        );
        throw toAdapterError(error);
      }
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
    return this.manager.discover(integration.type, this.credentialsOf(integration));
  }
}
