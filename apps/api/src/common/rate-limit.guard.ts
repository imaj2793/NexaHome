import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

interface Hit {
  count: number;
  resetAt: number;
}

/**
 * Rate limiter in-memory sederhana (sliding window per IP + route).
 *
 * Dipakai untuk melindungi endpoint sensitif (auth) dari brute-force.
 * Untuk deployment multi-instance, ganti dengan store terpusat (Redis).
 *
 * Konfigurasi via env:
 * - AUTH_RATE_LIMIT_MAX (default 10)
 * - AUTH_RATE_LIMIT_WINDOW_MS (default 60000)
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, Hit>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor() {
    const max = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);
    const windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000);
    this.max = Number.isFinite(max) && max > 0 ? max : 10;
    this.windowMs =
      Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const route = req.route?.path ?? req.url;
    const key = `${req.ip ?? 'unknown'}:${req.method}:${route}`;
    const now = Date.now();

    this.prune(now);

    const hit = this.hits.get(key);
    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    hit.count += 1;
    if (hit.count > this.max) {
      const retryAfter = Math.ceil((hit.resetAt - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Terlalu banyak percobaan. Coba lagi nanti.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /** Buang entri kedaluwarsa agar map tidak tumbuh tanpa batas. */
  private prune(now: number) {
    if (this.hits.size < 1000) return;
    for (const [key, hit] of this.hits) {
      if (hit.resetAt <= now) this.hits.delete(key);
    }
  }
}
