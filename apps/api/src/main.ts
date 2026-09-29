import 'reflect-metadata';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Security hardening (Phase 8): header keamanan standar.
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',') : true,
    credentials: true,
  });

  const port = config.get<number>('API_PORT') ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 NexaHome API ready at http://localhost:${port}/api`);
}

bootstrap();
