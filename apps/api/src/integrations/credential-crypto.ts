import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Enkripsi kredensial integrasi at-rest (spec §12).
 *
 * `Integration.config` dulu disimpan plaintext dan ikut dikembalikan apa
 * adanya oleh `GET /integrations`, sehingga token broker/vendor bocor ke
 * browser. Sekarang isinya disimpan sebagai amplop AES-256-GCM dan hanya
 * kunci (nama field) yang terlihat di luar.
 *
 * Kunci diturunkan dari env `INTEGRATION_CREDENTIALS_KEY` memakai scrypt
 * dengan salt konstan. Konsekuensinya yang harus diketahui: mengganti
 * passphrase membuat seluruh kredensial lama tidak terbaca — tidak ada
 * jalan pemulihan selain menyimpan ulang kredensial di tiap integrasi.
 */

/** Bentuk amplop yang disimpan di kolom `Integration.config`. */
export interface CredentialEnvelope {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
  /** Nama field saja — nilai rahasianya tetap terenkripsi. */
  keys: string[];
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT = 'nexahome/integration-credentials/v1';
const MIN_PASSPHRASE_LENGTH = 16;

/** Nilai yang dikirim ke klien sebagai pengganti rahasia. */
export const REDACTED = '••••••';

/** Type guard: apakah nilai ini amplop terenkripsi? */
export function isCredentialEnvelope(
  value: unknown,
): value is CredentialEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<CredentialEnvelope>;
  return (
    v.v === 1 &&
    v.alg === ALGORITHM &&
    typeof v.iv === 'string' &&
    typeof v.tag === 'string' &&
    typeof v.data === 'string' &&
    Array.isArray(v.keys)
  );
}

function deriveKey(passphrase: string): Buffer {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `INTEGRATION_CREDENTIALS_KEY wajib diisi minimal ${MIN_PASSPHRASE_LENGTH} karakter.`,
    );
  }
  return scryptSync(passphrase, SALT, KEY_BYTES);
}

/** Enkripsi objek kredensial menjadi amplop yang aman disimpan. */
export function encryptCredentials(
  config: Record<string, unknown>,
  passphrase: string,
): CredentialEnvelope {
  const key = deriveKey(passphrase);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(config), 'utf8');
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    v: 1,
    alg: ALGORITHM,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    keys: Object.keys(config),
  };
}

/**
 * Dekripsi amplop. Dipanggil adapter/kode server saat butuh memakai
 * kredensial — tidak pernah dikirim ke klien.
 */
export function decryptCredentials(
  envelope: CredentialEnvelope,
  passphrase: string,
): Record<string, unknown> {
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null) return {};
  return parsed as Record<string, unknown>;
}

/**
 * Ganti seluruh nilai dengan penanda, keeping nama field-nya.
 * Dipakai untuk data lama yang belum terenkripsi saat dibaca.
 */
export function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      value === null || value === undefined ? null : REDACTED,
    ]),
  );
}

/** Bentuk yang aman dikirim ke klien untuk amplop terenkripsi. */
export function redactEnvelope(
  envelope: CredentialEnvelope,
): Record<string, unknown> {
  return redactConfig(Object.fromEntries(envelope.keys.map((k) => [k, ''])));
}
