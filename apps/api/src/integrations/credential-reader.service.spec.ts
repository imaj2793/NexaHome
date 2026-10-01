import type { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/errors/api-error';
import { encryptCredentials } from './credential-crypto';
import { CredentialReader } from './credential-reader.service';

const PASSPHRASE = 'kunci-uji-yang-panjang-sekali';

function reader(passphrase: string | undefined = PASSPHRASE): CredentialReader {
  return new CredentialReader({
    get: (key: string) => (key === 'INTEGRATION_CREDENTIALS_KEY' ? passphrase : undefined),
  } as ConfigService);
}

describe('CredentialReader', () => {
  describe('read', () => {
    it('dekripsi envelope dengan kunci yang benar', () => {
      const envelope = encryptCredentials({ username: 'u', password: 'p' }, PASSPHRASE);

      expect(reader().read(envelope)).toEqual({ username: 'u', password: 'p' });
    });

    it('config lama yang belum terenkripsi diteruskan apa adanya', () => {
      // Integrasi yang sudah jalan tidak boleh mati hanya karena upgrade.
      expect(reader().read({ url: 'mqtt://lokal:1883' })).toEqual({
        url: 'mqtt://lokal:1883',
      });
    });

    it('config kosong berarti tidak ada kredensial', () => {
      expect(reader().read(null)).toBeUndefined();
      expect(reader().read(undefined)).toBeUndefined();
      expect(reader().read('bukan objek')).toBeUndefined();
    });

    it('kunci yang salah melempar ApiError dengan kode yang bisa dibaca klien', () => {
      const envelope = encryptCredentials({ username: 'u' }, PASSPHRASE);

      // BadRequestException biasa akan dipetakan filter global jadi
      // VALIDATION_FAILED, jadi kodenya hilang sebelum sampai klien.
      const error = (() => {
        try {
          reader('kunci-yang-berbeda-sama-sekali').read(envelope);
          return null;
        } catch (e) {
          return e as ApiError;
        }
      })();

      expect(error).not.toBeNull();
      expect(error?.code).toBe('INTEGRATION_CREDENTIALS_INVALID');
      expect(error?.getStatus()).toBe(400);
      expect(error?.getResponse()).toMatchObject({
        success: false,
        error: { code: 'INTEGRATION_CREDENTIALS_INVALID' },
      });
    });

    it('pesan error tidak membocorkan passphrase atau detail kripto', () => {
      const envelope = encryptCredentials({ username: 'u' }, PASSPHRASE);

      try {
        reader('kunci-yang-berbeda-sama-sekali-atau-mungkin').read(envelope);
        expect.unreachable('harus melempar error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toContain('kunci-yang-berbeda-sama-sekali-atau-mungkin');
        expect(message).not.toContain(PASSPHRASE);
      }
    });
  });

  describe('tryRead', () => {
    it('mengembalikan kredensial yang terbaca', () => {
      const envelope = encryptCredentials({ username: 'u' }, PASSPHRASE);

      expect(reader().tryRead(envelope)).toEqual({ username: 'u' });
    });

    it('kegagalanEnvelope jadi undefined, bukan lempar error', () => {
      // Scan jaringan memakai tryRead: satu integrasi rusak tidak boleh
      // menggagalkan seluruh scan.
      const envelope = encryptCredentials({ username: 'u' }, PASSPHRASE);

      expect(reader('kunci-yang-berbeda-sama-sekali').tryRead(envelope)).toBeUndefined();
    });

    it('amplop dengan ciphertext korup juga jadi undefined', () => {
      // Bentuknya memang amplop, tapi isinya rusak — harus gagal, bukan
      // dianggap config lama dan dikirim apa adanya ke adapter.
      const rusak = {
        ...encryptCredentials({ username: 'u' }, PASSPHRASE),
        data: 'Zm9yZ2VkLWRhdGE',
      };

      expect(reader().tryRead(rusak)).toBeUndefined();
    });

    it('bentuk yang tidak dikenal diperlakukan sebagai config lama', () => {
      // `isCredentialEnvelope` hanya mengenali bentuk amplop yang lengkap;
      // objek lain dianggap config belum terenkripsi dan harus tetap jalan.
      expect(reader().tryRead({ url: 'mqtt://lokal:1883' })).toEqual({
        url: 'mqtt://lokal:1883',
      });
    });
  });
});