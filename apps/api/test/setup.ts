/**
 * Setup global untuk test Vitest.
 * Menyediakan default env agar test tidak bergantung pada file `.env`
 * yang gitignored (mis. di CI).
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-secret-0123456789abcdef0123456789abcdef';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1h';
process.env.JWT_REFRESH_EXPIRES_DAYS =
  process.env.JWT_REFRESH_EXPIRES_DAYS ?? '7';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://nexahome:nexahome@localhost:5432/nexahome?schema=public';
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? 'mock';
// Kunci tetap dipakai untuk enkripsi kredensial integrasi, tapi di sini
// nilainya hardcoded dan hanya berlaku untuk test — bukan rahasia produksi.
process.env.INTEGRATION_CREDENTIALS_KEY =
  process.env.INTEGRATION_CREDENTIALS_KEY ?? 'test-kredensial-tidak-untuk-produksi';
process.env.MQTT_MODE = process.env.MQTT_MODE ?? 'mock';
