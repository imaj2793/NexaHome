import { HttpException } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { ErrorCode } from '../common/errors/error-codes';

/**
 * Pola error Node yang menandakan perangkat/jaringan tidak terjangkau.
 * Dipakai untuk memetakan kegagalan adapter ke DEVICE_OFFLINE (spec §13)
 * alih-alih melempar 500 umum.
 */
const OFFLINE_PATTERNS = [
  'econnrefused',
  'enotfound',
  'ehostunreach',
  'enetunreach',
  'etimedout',
  'esockettimedout',
  'timeout',
  'timed out',
  'no response',
  'tidak ada respons',
  'offline',
  'econnreset',
];

function looksOffline(error: unknown): boolean {
  const haystack = [
    error instanceof Error ? error.message : String(error),
    (error as { code?: string } | null)?.code ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return OFFLINE_PATTERNS.some((p) => haystack.includes(p));
}

/**
 * Petakan kegagalan adapter menjadi ApiError yang jujur.
 *
 * - perangkat tidak terjangkau -> DEVICE_OFFLINE
 * - integrasi dimatikan / adapter belum ada -> INTEGRATION_NOT_AVAILABLE
 * - sisanya -> INTEGRATION_COMMAND_FAILED
 *
 * Detail teknis (URL, kredensial) tidak ikut ke pesan yang sampai ke klien.
 */
export function toAdapterError(error: unknown): ApiError {
  // Error yang sudah punya kode kontrak (mis. kredensial tidak terbaca)
  // diteruskan apa adanya — menerjemahkannya jadi INTEGRATION_COMMAND_FAILED
  // menyembunyikan penyebab sebenarnya dari pengguna.
  if (error instanceof ApiError || error instanceof HttpException) {
    return error as ApiError;
  }

  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('Tidak ada integration untuk tipe')) {
    return new ApiError(
      ErrorCode.INTEGRATION_NOT_AVAILABLE,
      raw.replace('Tidak ada integration untuk tipe', 'Belum ada integrasi untuk tipe'),
    );
  }

  if (raw.includes('tidak aktif') || raw.includes('disabled')) {
    return new ApiError(
      ErrorCode.INTEGRATION_NOT_AVAILABLE,
      'Integrasi perangkat ini sedang dimatikan.',
    );
  }

  if (looksOffline(error)) {
    return new ApiError(
      ErrorCode.DEVICE_OFFLINE,
      'Perangkat sedang tidak tersedia. Pastikan perangkat menyala dan terhubung.',
    );
  }

  return new ApiError(ErrorCode.INTEGRATION_COMMAND_FAILED);
}

/**
 * Pastikan perangkat benar-benar mendukung capability yang diminta
 * (spec §2 aturan 10: jangan menganggap semua perangkat mendukung
 * semua command).
 *
 * `capabilities` kosong berarti belum diketahui — perintah tetap diizinkan,
 * tetapi kondisi itu tidak bisa diam-diam diterima sebagai kepastian.
 */
export function assertCapabilitySupported(
  capabilities: readonly string[] | null | undefined,
  capability: string,
  deviceName: string,
): void {
  const known = capabilities ?? [];
  if (known.length === 0) return;
  if (known.includes(capability)) return;

  throw new ApiError(
    ErrorCode.CAPABILITY_NOT_SUPPORTED,
    `Perangkat ini tidak mendukung pengaturan ${capability}.`,
    { device: deviceName, requested: capability, supported: known },
  );
}

/**
 * Nilai capability harus masuk rentang yang masuk akal; perangkat pintar
 * yang salah baca perintah lebih berbahaya daripada menolak perintah.
 *
 * `temperature` = °C untuk AC, `color_temperature` = Kelvin untuk lampu.
 * Keduanya terpisah karena satu perangkat bisa punya keduanya.
 */
export function assertValueInRange(
  capability: string,
  value: unknown,
): void {
  if (capability !== 'temperature' && capability !== 'color_temperature') {
    return;
  }

  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new ApiError(
      ErrorCode.INVALID_COMMAND_VALUE,
      capability === 'temperature'
        ? 'Nilai suhu harus berupa angka.'
        : 'Nilai suhu warna harus berupa angka.',
      { capability },
    );
  }

  const [min, max] =
    capability === 'temperature' ? [5, 35] : [1000, 10_000];

  if (n < min || n > max) {
    throw new ApiError(
      ErrorCode.INVALID_COMMAND_VALUE,
      capability === 'temperature'
        ? `Suhu ${n}°C di luar rentang yang masuk akal (5–35 °C).`
        : `Suhu warna ${n}K di luar rentang (1000–10000 K).`,
      { capability, value: n, min, max },
    );
  }
}
