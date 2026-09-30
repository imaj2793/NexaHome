import { validateEnv } from './env.validation';

const base = {
  JWT_SECRET: 'a'.repeat(48),
  INTEGRATION_CREDENTIALS_KEY: 'k'.repeat(43),
  DATABASE_URL: 'postgresql://x:y@localhost:5432/db',
  CORS_ORIGIN: 'https://nexahome.example.com',
};

describe('validateEnv', () => {
  it('meloloskan konfigurasi produksi yang valid', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('menolak JWT_SECRET default di produksi', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-in-production',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('menolak INTEGRATION_CREDENTIALS_KEY yang hilang', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        INTEGRATION_CREDENTIALS_KEY: '',
      }),
    ).toThrow(/INTEGRATION_CREDENTIALS_KEY/);
  });

  it('menolak INTEGRATION_CREDENTIALS_KEY terlalu pendek', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        INTEGRATION_CREDENTIALS_KEY: 'pendek',
      }),
    ).toThrow(/INTEGRATION_CREDENTIALS_KEY/);
  });

  it('menolak JWT_SECRET terlalu pendek di produksi', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'pendek' }),
    ).toThrow(/minimal 32/);
  });

  it('menerima CORS localhost di produksi (self-hosted) tanpa throw', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'http://localhost:3000',
      }),
    ).not.toThrow();
  });

  it('tetap menolak CORS_ORIGIN kosong di produksi', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', CORS_ORIGIN: '' }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('hanya memberi peringatan (tidak throw) di dev', () => {
    expect(() =>
      validateEnv({
        ...base,
        JWT_SECRET: 'change-me-in-production',
      }),
    ).not.toThrow();
  });
});
