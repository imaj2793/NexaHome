import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/errors/api-error';
import { ErrorCode } from '../common/errors/error-codes';
import { accessibleHomeFilter } from '../homes/home-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptCredentials,
  encryptCredentials,
  isCredentialEnvelope,
  redactConfig,
  redactEnvelope,
} from './credential-crypto';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

/** Bentuk integrasi yang aman dikirim ke klien (tanpa nilai rahasia). */
export interface SafeIntegration {
  id: string;
  name: string;
  type: string;
  homeId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  /** true bila config tersimpan terenkripsi. */
  credentialsEncrypted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findAll(userId: string, homeId?: string) {
    if (homeId) await this.assertHomeOwned(userId, homeId);
    const rows = await this.prisma.integration.findMany({
      where: { home: accessibleHomeFilter(userId), ...(homeId ? { homeId } : {}) },
    });
    return rows.map((row) => this.toSafe(row));
  }

  async create(userId: string, dto: CreateIntegrationDto) {
    await this.assertHomeOwned(userId, dto.homeId);
    const row = await this.prisma.integration.create({
      data: {
        name: dto.name,
        type: dto.type,
        homeId: dto.homeId,
        enabled: dto.enabled ?? true,
        config: this.encodeConfig(dto.config ?? {}),
      },
    });
    return this.toSafe(row);
  }

  /**
   * Ubah nama/status, dan/atau simpan ulang kredensial terenkripsi.
   *
   * KHUSUS PEMILIK: menulis kredensial adalah perubahan
   * keamanan, jadi anggota rumah (walaupun boleh memakai perangkat) tidak
   * boleh menyentuh integrasi. Sama seperti `create`.
   */
  async update(userId: string, id: string, dto: UpdateIntegrationDto) {
    const existing = await this.prisma.integration.findFirst({
      where: { id, home: { ownerId: userId } },
    });
    if (!existing) {
      // Jangan bocorkan keberadaan integrasi milik rumah orang.
      throw new ApiError(ErrorCode.NOT_FOUND, 'Integration tidak ditemukan.');
    }

    const row = await this.prisma.integration.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.config !== undefined
          ? { config: this.encodeConfig(dto.config) }
          : {}),
      },
    });
    return this.toSafe(row);
  }

  /**
   * Config asli (terdekripsi) untuk dipakai adapter di sisi server.
   * Tidak pernah dipanggil dari controller.
   */
  async readCredentials(
    userId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const row = await this.prisma.integration.findFirst({
      where: { id, home: accessibleHomeFilter(userId) },
    });
    if (!row) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Integration tidak ditemukan.');
    }
    const config = row.config as Record<string, unknown>;
    if (!isCredentialEnvelope(config)) {
      // Data lama yang belum dienkripsi: dipakai apa adanya supaya
      // integrasi tetap jalan, tapi tidak pernah dikembalikan ke klien.
      return config;
    }
    return decryptCredentials(config, this.passphrase());
  }

  /** config -> amplop terenkripsi. Config kosong dibiarkan `{}`. */
  private encodeConfig(config: Record<string, unknown>): object {
    if (Object.keys(config).length === 0) return {};
    try {
      return encryptCredentials(config, this.passphrase()) as unknown as object;
    } catch (error) {
      // Server belum punya kunci: menolak menyimpan daripada menyimpan
      // kredensial plaintext.
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Kredensial integrasi tidak dapat disimpan: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private passphrase(): string {
    const key = this.config.get<string>('INTEGRATION_CREDENTIALS_KEY') ?? '';
    if (!key) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'INTEGRATION_CREDENTIALS_KEY belum diisi, sehingga kredensial ' +
          'tidak bisa disimpan dengan aman.',
      );
    }
    return key;
  }

  /** Buang nilai rahasia sebelum serialisasi ke klien. */
  private toSafe(row: {
    id: string;
    name: string;
    type: string;
    homeId: string;
    enabled: boolean;
    config: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): SafeIntegration {
    const config = (row.config ?? {}) as Record<string, unknown>;
    const encrypted = isCredentialEnvelope(config);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      homeId: row.homeId,
      enabled: row.enabled,
      config: encrypted ? redactEnvelope(config) : redactConfig(config),
      credentialsEncrypted: encrypted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async assertHomeOwned(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ownerId: userId },
    });
    if (!home) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Home tidak ditemukan.');
    }
    return home;
  }
}
