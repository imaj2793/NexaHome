import { HttpException, HttpStatus } from '@nestjs/common';
import { AppExceptionFilter } from './app-exception.filter';
import { ApiError } from './api-error';
import { ErrorCode } from './error-codes';

/** Bangun host HTTP palsu yang menangkap apa yang ditulis filter. */
function hostReturning() {
  const written: { status: number; body: unknown } = { status: 0, body: null };
  const response = {
    status(code: number) {
      written.status = code;
      return this;
    },
    json(body: unknown) {
      written.body = body;
      return this;
    },
  };
  const request = { method: 'GET', url: '/api/devices' };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  };
  return { host, written };
}

describe('AppExceptionFilter', () => {
  let filter: AppExceptionFilter;

  beforeEach(() => {
    filter = new AppExceptionFilter();
  });

  it('men liberallykan ApiError apa adanya', () => {
    const { host, written } = hostReturning();

    filter.catch(
      new ApiError(
        ErrorCode.DEVICE_OFFLINE,
        'Lampu ruang tamu sedang tidak tersedia.',
      ),
      host as never,
    );

    expect(written.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(written.body).toEqual({
      success: false,
      error: {
        code: 'DEVICE_OFFLINE',
        message: 'Lampu ruang tamu sedang tidak tersedia.',
      },
    });
  });

  it('memetakan HttpException bawaan ke kode dari statusnya', () => {
    const cases: Array<[HttpException, string]> = [
      [new HttpException('ancak', HttpStatus.NOT_FOUND), 'NOT_FOUND'],
      [
        new HttpException('nope', HttpStatus.UNAUTHORIZED),
        'UNAUTHORIZED',
      ],
      [
        new HttpException('pelan-pelan', HttpStatus.TOO_MANY_REQUESTS),
        'RATE_LIMITED',
      ],
    ];

    for (const [exception, code] of cases) {
      const { host, written } = hostReturning();
      filter.catch(exception, host as never);
      expect((written.body as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it('menyeratkkan pesan array ValidationPipe tanpa membocorkan bentuk lain', () => {
    const { host, written } = hostReturning();

    filter.catch(
      new HttpException(
        { statusCode: 400, message: ['name harus string', 'type wajib'] },
        HttpStatus.BAD_REQUEST,
      ),
      host as never,
    );

    expect(written.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'name harus string type wajib',
        details: { fields: ['name harus string', 'type wajib'] },
      },
    });
  });

  it('meneruskan retryAfter dari rate-limit guard', () => {
    const { host, written } = hostReturning();

    filter.catch(
      new HttpException(
        {
          statusCode: 429,
          message: 'Terlalu banyak percobaan.',
          retryAfter: 42,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      host as never,
    );

    expect((written.body as { error: { details: unknown } }).error.details).toEqual(
      { retryAfter: 42 },
    );
  });

  it('menyembunyikan pesan error internal dari klien', () => {
    const { host, written } = hostReturning();

    filter.catch(
      new Error('koneksi ke postgres://user:rahasia@host gagal'),
      host as never,
    );

    expect(written.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = written.body as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    // Kredensial dari pesan asli tidak boleh sampai ke klien.
    expect(body.error.message).not.toContain('rahasia');
  });

  it('menyeratkkan detail capability pada CAPABILITY_NOT_SUPPORTED', () => {
    const { host, written } = hostReturning();

    filter.catch(
      new ApiError(
        ErrorCode.CAPABILITY_NOT_SUPPORTED,
        'Perangkat ini tidak mendukung pengaturan brightness.',
        { requested: 'brightness', supported: ['power'] },
      ),
      host as never,
    );

    expect(written.body).toEqual({
      success: false,
      error: {
        code: 'CAPABILITY_NOT_SUPPORTED',
        message: 'Perangkat ini tidak mendukung pengaturan brightness.',
        details: { requested: 'brightness', supported: ['power'] },
      },
    });
  });
});
