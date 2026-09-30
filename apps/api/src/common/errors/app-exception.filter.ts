import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, type ApiErrorBody } from './api-error';
import { codeForStatus } from './error-codes';

/**
 * Filter global: semua error keluar sebagai kontrak yang sama (spec §13)
 *
 *     { "success": false, "error": { "code": "...", "message": "..." } }
 *
 * Exception bawaan NestJS (NotFoundException, ValidationPipe, guard rate
 * limit, dst.) dipetakan ke kode berdasarkan statusnya, sehingga controller
 * yang melempar `NotFoundException` tidak perlu diubah satu per satu.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    // Filter ini hanya untuk jalur HTTP. Untuk WebSocket/WS context biarkan
    // exception ditangani framework masing-masing.
    if (host.getType<string>() !== 'http') {
      this.logger.error(
        `Exception di luar konteks HTTP: ${describe(exception)}`,
      );
      return;
    }

    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Detail internal hanya ke log server, tidak pernah ke klien.
      this.logger.error(
        `${body.error.code} pada ${host.switchToHttp().getRequest().method} ` +
          `${host.switchToHttp().getRequest().url}: ${describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  /** Terjemahkan exception apa pun menjadi status + body kontrak. */
  private normalize(exception: unknown): {
    status: number;
    body: ApiErrorBody;
  } {
    // 1) ApiError kita sendiri: body's sudah kontrak,/status eksplisit.
    if (exception instanceof ApiError) {
      const { error } = exception.getResponse() as {
        error?: ApiErrorBody['error'];
      };
      if (error) {
        return {
          status: exception.getStatus(),
          body: { success: false, error },
        };
      }
    }

    // 2) HttpException bawaan NestJS / guard kita.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = codeForStatus(status);
      const payload = exception.getResponse();
      const { message, details } = extractMessage(payload);
      return {
        status,
        body: ApiError.bodyOf(code, message, details),
      };
    }

    // 3) Error biasa: jangan bocorkan pesan internal ke klien.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: ApiError.bodyOf(
        'INTERNAL_ERROR',
        'Terjadi kesalahan di server.',
      ),
    };
  }
}

/** Ambil pesan (string atau array dari ValidationPipe) + detail tambahan. */
function extractMessage(payload: string | object): {
  message: string;
  details?: Record<string, unknown>;
} {
  if (typeof payload === 'string') return { message: payload };

  const record = payload as Record<string, unknown>;
  const raw = record.message;
  const details: Record<string, unknown> = {};

  // `retryAfter` dari rate-limit guard tetap diteruskan agar klien bisa
  // menunggu dengan benar.
  if (typeof record.retryAfter === 'number') {
    details.retryAfter = record.retryAfter;
  }

  if (Array.isArray(raw)) {
    const messages = raw.filter((m): m is string => typeof m === 'string');
    if (messages.length > 0) {
      details.fields = messages;
      return { message: messages.join(' '), details };
    }
  }
  if (typeof raw === 'string') return { message: raw, details };

  return { message: 'Permintaan gagal diproses.', details };
}

function describe(exception: unknown): string {
  if (exception instanceof Error) return `${exception.name}: ${exception.message}`;
  return String(exception);
}
