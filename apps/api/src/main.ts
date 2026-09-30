import 'reflect-metadata';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/errors/app-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Security hardening (Phase 8): header keamanan standar.
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  // Kontrak error seragam untuk semua route (spec §13):
  // { success: false, error: { code, message } }
  app.useGlobalFilters(new AppExceptionFilter());

  // Di belakang reverse proxy (nginx/traefik), aktifkan trust proxy agar
  // rate limiting melihat IP klien sebenarnya (set TRUST_PROXY=1).
  if (config.get<string>('TRUST_PROXY') === '1') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  const corsOrigin = config.get<string>('CORS_ORIGIN');
  const origins = corsOrigin
    ? corsOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];
  app.enableCors({
    // Di produksi hanya origin terdaftar (validasi env menjamin CORS_ORIGIN ada);
    // di dev tanpa konfigurasi, izinkan request same-origin/tool.
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  // Nilai env selalu string; `app.listen("3001")` akan diperlakukan Node
  // sebagai nama pipe UNIX, bukan port. Parse eksplisit dengan fallback.
  const port = Number.parseInt(config.get<string>('API_PORT') ?? '', 10) || 3001;
  await app.listen(port);
  console.log(`🚀 NexaHome API ready at http://localhost:${port}/api`);
}

bootstrap();
