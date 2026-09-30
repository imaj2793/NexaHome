import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';
import { ApiError } from '../common/errors/api-error';
import {
  decryptCredentials,
  encryptCredentials,
  isCredentialEnvelope,
  redactConfig,
  REDACTED,
} from './credential-crypto';

const PASSPHRASE = 'kunci-integrasi-yang-panjang-sekali';

describe('credential-crypto', () => {
  it('mengenkripsi lalu mendekripsi kembali nilai asli', () => {
    const secrets = { token: 'tok_abc', refresh: 'ref_xyz' };
    const envelope = encryptCredentials(secrets, PASSPHRASE);

    expect(isCredentialEnvelope(envelope)).toBe(true);
    // Nilai asli tidak boleh muncul di plaintext pada amplop.
    expect(JSON.stringify(envelope)).not.toContain('tok_abc');
    expect(decryptCredentials(envelope, PASSPHRASE)).toEqual(secrets);
  });

  it('menolak passphrase pendek', () => {
    expect(() => encryptCredentials({ a: 'b' }, 'pendek')).toThrow(
      /minimal 16 karakter/,
    );
  });

  it('tidak bisa didekripsi dengan passphrase lain', () => {
    const envelope = encryptCredentials({ token: 'rahasia' }, PASSPHRASE);
    expect(() => decryptCredentials(envelope, 'passphrase-lain-yang-panjang')).toThrow();
  });

  it('mengganti nilai dengan penanda saat menyamarkan config', () => {
    const redacted = redactConfig({ token: 'tok', note: 'catatan' });
    expect(redacted).toEqual({ token: REDACTED, note: REDACTED });
  });
});

describe('IntegrationsService — kredensial', () => {
  const row = (config: unknown) => ({
    id: 'int_1',
    name: 'MQTT',
    type: 'MQTT' as const,
    homeId: 'home_1',
    enabled: true,
    config,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  /** Service + mock prisma/config. Konstruksi manual, tanpa Nest DI. */
  const build = (stored: unknown[] = [], passphrase: string = PASSPHRASE) => {
    const prisma = {
      integration: {
        findMany: vi.fn().mockResolvedValue(stored),
        findFirst: vi.fn().mockResolvedValue(stored[0] ?? null),
        create: vi.fn().mockResolvedValue(row({})),
        update: vi.fn().mockResolvedValue(row({})),
      },
      home: { findFirst: vi.fn().mockResolvedValue({ id: 'home_1' }) },
    };
    const config = { get: () => passphrase } as unknown as ConfigService;
    const service = new IntegrationsService(
      prisma as unknown as PrismaService,
      config,
    );
    return { service, prisma };
  };

  it('tidak pernah mengembalikan nilai kredensial ke klien', async () => {
    const { service, prisma } = build();
    prisma.integration.findMany.mockResolvedValue([
      row(encryptCredentials({ token: 'tok_rahasia' }, PASSPHRASE)),
    ]);

    const [result] = await service.findAll('user_1');

    expect(result.credentialsEncrypted).toBe(true);
    expect(result.config).toEqual({ token: REDACTED });
    expect(JSON.stringify(result)).not.toContain('tok_rahasia');
  });

  it('menandai data lama yang belum terenkripsi', async () => {
    const { service, prisma } = build();
    prisma.integration.findMany.mockResolvedValue([row({ token: 'tok_lama' })]);

    const [result] = await service.findAll('user_1');

    expect(result.credentialsEncrypted).toBe(false);
    expect(result.config.token).toBe(REDACTED);
    expect(JSON.stringify(result)).not.toContain('tok_lama');
  });

  it('menyimpan config baru sebagai ciphertext', async () => {
    const { service, prisma } = build();

    await service.create('user_1', {
      name: 'MQTT',
      type: 'MQTT',
      homeId: 'home_1',
      config: { token: 'tok_baru' },
    });

    const call = prisma.integration.create.mock.calls[0][0];
    expect(isCredentialEnvelope(call.data.config)).toBe(true);
    expect(JSON.stringify(call.data.config)).not.toContain('tok_baru');
  });

  it('menolak menyimpan kredensial saat kunci belum diatur', async () => {
    const { service } = build([], '');

    await expect(
      service.create('user_1', {
        name: 'MQTT',
        type: 'MQTT',
        homeId: 'home_1',
        config: { token: 'tok' },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('readCredentials mengembalikan nilai asli hanya di sisi server', async () => {
    const { service, prisma } = build();
    prisma.integration.findFirst.mockResolvedValue(
      row(encryptCredentials({ token: 'tok_server' }, PASSPHRASE)),
    );

    const config = await service.readCredentials('user_1', 'int_1');
    expect(config.token).toBe('tok_server');
  });

  it('readCredentials hanya untuk pemilik rumah', async () => {
    const { service, prisma } = build();
    // Mock menolak query owner-only: integrasi ini bukan milik user_2.
    prisma.integration.findFirst.mockResolvedValue(null);

    await expect(service.readCredentials('user_2', 'int_1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('update memakai filter owner-only, bukan filter anggota', async () => {
    const { service, prisma } = build();
    prisma.integration.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_2', 'int_1', { config: { token: 'tok_baru' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Kalau filter ever berubah kembali ke "owner atau anggota", test ini gagal:
    // query wajib menyertakan ownerId.
    const where = prisma.integration.findFirst.mock.calls[0][0].where;
    expect(where.home.ownerId).toBe('user_2');
    expect(where.home.ownerId).not.toBeUndefined();
    expect(prisma.integration.update).not.toHaveBeenCalled();
  });
});

describe('IntegrationsService — kredensial tidak terbaca', () => {
  const PASSPHRASE = 'kunci-uji-yang-panjang-sekali';
  const OTHER = 'kunci-lain-yang-juga-panjang-sekali';

  const row = (config: unknown) => ({
    id: 'int_1',
    name: 'MQTT',
    type: 'MQTT' as const,
    homeId: 'home_1',
    enabled: true,
    config,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const build = (passphrase: string) => {
    const prisma = {
      integration: { findFirst: vi.fn().mockResolvedValue(null) },
      home: { findFirst: vi.fn().mockResolvedValue({ id: 'home_1' }) },
    };
    const config = { get: () => passphrase } as unknown as ConfigService;
    return {
      service: new IntegrationsService(prisma as unknown as PrismaService, config),
      prisma,
    };
  };

  it('kunci yang salah memberi INTEGRATION_CREDENTIALS_INVALID, bukan error kripto', async () => {
    const { service, prisma } = build(OTHER);
    prisma.integration.findFirst.mockResolvedValue(
      row(encryptCredentials({ token: 'tok_rahasia' }, PASSPHRASE)),
    );

    const error = await service
      .readCredentials('usr_1', 'int_1')
      .then(() => null)
      .catch((e: ApiError) => e);

    expect(error).not.toBeNull();
    expect((error as ApiError).code).toBe('INTEGRATION_CREDENTIALS_INVALID');
    // Detail internal (nama algoritma, scrypt) tidak boleh bocor.
    expect(JSON.stringify(error)).not.toMatch(/scrypt|aes|gcm|Unsupported state/i);
  });

  it('kunci yang benar tetap membuka kredensial', async () => {
    const { service, prisma } = build(PASSPHRASE);
    prisma.integration.findFirst.mockResolvedValue(
      row(encryptCredentials({ token: 'tok_rahasia' }, PASSPHRASE)),
    );

    await expect(service.readCredentials('usr_1', 'int_1')).resolves.toEqual({
      token: 'tok_rahasia',
    });
  });

  it('amplop yang rusak (diubah tangan) juga ditolak, bukan diam-diam dipakai', async () => {
    const { service, prisma } = build(PASSPHRASE);
    const envelope = encryptCredentials({ token: 'tok' }, PASSPHRASE);
    prisma.integration.findFirst.mockResolvedValue(
      // Auth tag dimanipulasi → GCM harus gagal.
      row({ ...envelope, tag: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }),
    );

    await expect(service.readCredentials('usr_1', 'int_1')).rejects.toMatchObject({
      code: 'INTEGRATION_CREDENTIALS_INVALID',
    });
  });
});
