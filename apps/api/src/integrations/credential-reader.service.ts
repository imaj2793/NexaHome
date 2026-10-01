import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdapterCredentials } from '@nexahome/device-core';
import { ApiError } from '../common/errors/api-error';
import { ErrorCode } from '../common/errors/error-codes';
import { decryptCredentials, isCredentialEnvelope } from './credential-crypto';

/**
 * Membaca `Integration.config` menjadi kredensial yang bisa dipakai adapter.
 *
 * `config` disimpan terenkripsi di database, jadi kelas inilah satu-satunya
 * tempat di server yang berubah dari ciphertext menjadi nilai asli — hasilnya
 * langsung masuk adapter dan tidak pernah masuk respons HTTP.
 *
 * Config lama yang belum dienkripsi diteruskan apa adanya supaya integrasi
 * yang sudah jalan tidak mati setelah upgrade.
 */
@Injectable()
export class CredentialReader {
  private readonly logger = new Logger(CredentialReader.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Kredensial integrasi, atau lempar error.
   *
   * Dipakai saat satu perintah bergantung pada satu integrasi: kegagalan baca
   * berarti perintah tidak boleh dikirim, karena tanpa kredensial yang terkirim
   * adalah broker atau perangkat global — perangkat yang berbeda dari yang
   * diminta pengguna.
   *
   * Error dilempar sebagai `ApiError`, bukan `BadRequestException` biasa:
   * filter global memetakan `HttpException` biasa ke `VALIDATION_FAILED` dan
   * kodenya jadi hilang di respons.
   */
  read(config: unknown): AdapterCredentials | undefined {
    if (!config || typeof config !== 'object') return undefined;
    if (!isCredentialEnvelope(config)) {
      return config as AdapterCredentials;
    }
    try {
      return decryptCredentials(config, this.passphrase());
    } catch {
      // Melempar error kripto mentah (scrypt/GCM) akan membuka detail
      // internal; pemanggil butuh tahu itu masalah kunci, bukan bug.
      throw new ApiError(
        ErrorCode.INTEGRATION_CREDENTIALS_INVALID,
        'Kredensial integrasi tidak bisa dibaca. INTEGRATION_CREDENTIALS_KEY ' +
          'mungkin salah atau berubah sejak kredensial ini disimpan.',
      );
    }
  }

  /**
   * Kredensial integrasi, atau `undefined` tanpa melempar error.
   *
   * Dipakai untuk operasi gabungan seperti scan jaringan: satu integrasi dengan
   * envelope rusak tidak boleh menggagalkan seluruh scan. Kredensial yang tidak
   * terbaca juga tidak boleh diam-diam diganti kredensial global, karena itu
   * akan mengembalikan perangkat milik integrasi orang lain. Nol kredensial
   * lebih jujur daripada kredensial yang salah.
   */
  tryRead(config: unknown): AdapterCredentials | undefined {
    try {
      return this.read(config);
    } catch (error) {
      this.logger.warn(
        `Integrasi dilewati karena kredensialnya tidak bisa dibaca: ` +
          `${(error as Error).message}`,
      );
      return undefined;
    }
  }

  private passphrase(): string {
    return this.config.get<string>('INTEGRATION_CREDENTIALS_KEY') ?? '';
  }
}