import { Logger } from '@nestjs/common';

/** Nilai JWT_SECRET yang dianggap tidak aman (dipakai di .env.example / dev). */
const INSECURE_SECRETS = new Set([
  'change-me-in-production',
  'changeme',
  'secret',
  'nexahome',
]);

const MIN_SECRET_LENGTH = 32;

/**
 * Validasi environment (Fase H security hardening):
 * - produksi wajib punya JWT_SECRET kuat (bukan default) & CORS_ORIGIN terisi;
 * - CORS_ORIGIN localhost hanya memberi peringatan: untuk instalasi self-hosted
 *   di mesin sendiri itu nilai yang wajar, dan tetap fail-closed karena hanya
 *   origin terdaftar yang diizinkan (bukan `origin: true`);
 * - dev hanya diberi peringatan bila memakai nilai default.
 *
 * Dipakai sebagai `validate` pada ConfigModule.forRoot.
 */
export function validateEnv(config: Record<string, unknown>) {
  const isProd = config.NODE_ENV === 'production';
  const logger = new Logger('EnvValidation');

  const jwtSecret =
    typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';
  const corsOrigins = (typeof config.CORS_ORIGIN === 'string'
    ? config.CORS_ORIGIN
    : ''
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const errors: string[] = [];

  if (!jwtSecret) {
    errors.push('JWT_SECRET wajib diisi.');
  } else if (INSECURE_SECRETS.has(jwtSecret)) {
    errors.push('JWT_SECRET masih memakai nilai default yang tidak aman.');
  } else if (isProd && jwtSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`JWT_SECRET minimal ${MIN_SECRET_LENGTH} karakter di produksi.`);
  }

  if (!config.DATABASE_URL) {
    errors.push('DATABASE_URL wajib diisi.');
  }

  // Kredensial integrasi disimpan terenkripsi (§12). Tanpa kunci, satu-satunya
  // pilihan adalah menyimpan plaintext — itu tidak boleh terjadi diam-diam.
  const credKey =
    typeof config.INTEGRATION_CREDENTIALS_KEY === 'string'
      ? config.INTEGRATION_CREDENTIALS_KEY.trim()
      : '';
  if (!credKey) {
    errors.push(
      'INTEGRATION_CREDENTIALS_KEY wajib diisi (openssl rand -base64 32).',
    );
  } else if (credKey.length < 16) {
    errors.push('INTEGRATION_CREDENTIALS_KEY minimal 16 karakter.');
  }

  if (isProd) {
    if (corsOrigins.length === 0) {
      errors.push('CORS_ORIGIN wajib diisi di produksi.');
    } else if (corsOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o))) {
      logger.warn(
        'CORS_ORIGIN menunjuk ke localhost. Ini wajar untuk self-hosted, ' +
          'tetapi pastikan hanya origin tersebut yang boleh mengakses API.',
      );
    }
  }

  if (errors.length > 0) {
    const message = `Konfigurasi environment tidak valid:\n- ${errors.join('\n- ')}`;
    if (isProd) throw new Error(message);
    logger.warn(message.replace(/\n/g, ' '));
  }

  return config;
}
