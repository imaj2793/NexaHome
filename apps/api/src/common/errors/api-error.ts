import { HttpException } from '@nestjs/common';
import {
  DEFAULT_ERROR_MESSAGE,
  ERROR_STATUS,
  type ErrorCode,
} from './error-codes';

/** Bentuk error yang dikirim ke klien (spec §13). */
export interface ApiErrorBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Exception dengan kode error eksplisit.
 *
 * Bentuk respons sudah `{ success: false, error: { code, message } }`,
 * jadi service bisa tetap melempar error yang tepat tanpa-filter pun aman.
 * `message` sengaja ikut di level atas supaya `HttpException.message`
 * tetap berupa string (dipakai Nest untuk logging dan test).
 */
export class ApiError extends HttpException {
  readonly code: ErrorCode;

  constructor(
    code: ErrorCode,
    message?: string,
    details?: Record<string, unknown>,
    status?: number,
  ) {
    const finalMessage = message ?? DEFAULT_ERROR_MESSAGE[code];
    const error: ApiErrorBody['error'] = {
      code,
      message: finalMessage,
        // details kosong tidak perlu muncul di respons.
      ...(details && Object.keys(details).length > 0 ? { details } : {}),
    };
    super(
      {
        message: finalMessage,
        success: false,
        error,
        ...(status ? { statusCode: status } : {}),
      },
      status ?? ERROR_STATUS[code],
    );
    this.code = code;
  }

  /** Bentuk body untuk filter/Interceptor. */
  static bodyOf(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): ApiErrorBody {
    return {
      success: false,
      error: {
        code,
        message,
        ...(details && Object.keys(details).length > 0 ? { details } : {}),
      },
    };
  }
}
