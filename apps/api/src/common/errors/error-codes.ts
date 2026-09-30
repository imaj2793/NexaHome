import { HttpStatus } from '@nestjs/common';

/**
 * Kode error kanonik NexaHome (spec §13).
 *
 * Klien (web, AI, integrasi) boleh bercabang pada `code`; `message`
 * sengaja hanya untuk manusia dan boleh berubah kapan saja.
 */
export const ErrorCode = {
  /** Masukan tidak valid / gagal validasi DTO. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Token hilang, kedaluwarsa, atau tidak valid. */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Terautentikasi tapi tidak punya akses ke sumber daya. */
  FORBIDDEN: 'FORBIDDEN',
  /** Rate limit terlampaui. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Sumber daya tidak ada (atau tidak terlihat oleh pemanggil). */
  NOT_FOUND: 'NOT_FOUND',

  /** Perangkat Known tapi sedang tidak bisa dihubungi. */
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  /** Perangkat tidak mendukung capability yang diminta. */
  CAPABILITY_NOT_SUPPORTED: 'CAPABILITY_NOT_SUPPORTED',
  /** Aksi dikenal tapi nilainya tidak masuk akal (mis. suhu 999). */
  INVALID_COMMAND_VALUE: 'INVALID_COMMAND_VALUE',

  /** Tipe integrasi tidak punya adapter terdaftar. */
  INTEGRATION_NOT_AVAILABLE: 'INTEGRATION_NOT_AVAILABLE',
  /** Adapter gagal menjalankan perintah (broker mati, HTTP error, timeout). */
  INTEGRATION_COMMAND_FAILED: 'INTEGRATION_COMMAND_FAILED',

  /** Kredensial integrasi tidak ada / gagal dipakai. */
  INTEGRATION_CREDENTIALS_INVALID: 'INTEGRATION_CREDENTIALS_INVALID',

  /** Kesalahan tak terduga di server. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Status HTTP untuk setiap kode. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.DEVICE_OFFLINE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.CAPABILITY_NOT_SUPPORTED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INVALID_COMMAND_VALUE]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INTEGRATION_NOT_AVAILABLE]: HttpStatus.NOT_IMPLEMENTED,
  [ErrorCode.INTEGRATION_COMMAND_FAILED]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.INTEGRATION_CREDENTIALS_INVALID]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Pesan bawaan Bahasa Indonesia bila pemanggil tidak memberi pesan. */
export const DEFAULT_ERROR_MESSAGE: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_FAILED]: 'Data yang dikirim tidak valid.',
  [ErrorCode.UNAUTHORIZED]: 'Anda harus masuk terlebih dahulu.',
  [ErrorCode.FORBIDDEN]: 'Anda tidak punya akses ke sumber daya ini.',
  [ErrorCode.RATE_LIMITED]: 'Terlalu banyak percobaan. Coba lagi nanti.',
  [ErrorCode.NOT_FOUND]: 'Data tidak ditemukan.',
  [ErrorCode.DEVICE_OFFLINE]:
    'Perangkat sedang tidak tersedia. Pastikan perangkat menyala dan terhubung.',
  [ErrorCode.CAPABILITY_NOT_SUPPORTED]:
    'Perangkat ini tidak mendukung perintah tersebut.',
  [ErrorCode.INVALID_COMMAND_VALUE]: 'Nilai perintah tidak valid.',
  [ErrorCode.INTEGRATION_NOT_AVAILABLE]:
    'Belum ada integrasi yang menangani perangkat ini.',
  [ErrorCode.INTEGRATION_COMMAND_FAILED]:
    'Perintah gagal diteruskan ke perangkat. Periksa integrasinya.',
  [ErrorCode.INTEGRATION_CREDENTIALS_INVALID]:
    'Kredensial integrasi ditolak. Simpan ulang kredensial Anda.',
  [ErrorCode.INTERNAL_ERROR]: 'Terjadi kesalahan di server.',
};

/** Petakan status HTTP → kode, untuk exception bawaan NestJS. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED;
    case HttpStatus.NOT_IMPLEMENTED:
      return ErrorCode.INTEGRATION_NOT_AVAILABLE;
    case HttpStatus.BAD_GATEWAY:
      return ErrorCode.INTEGRATION_COMMAND_FAILED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorCode.DEVICE_OFFLINE;
    default:
      return status >= 500
        ? ErrorCode.INTERNAL_ERROR
        : ErrorCode.VALIDATION_FAILED;
  }
}
