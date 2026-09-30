import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

/** JWT_SECRET wajib ada; validateEnv menolak nilai defaultnya. */
function requiredSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET') ?? '';
  if (!secret) {
    throw new Error('JWT_SECRET wajib diisi.');
  }
  return secret;
}

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Tidak ada fallback diam-diam: secret kosong akan membuat token bisa
        // ditebak. validateEnv sudah menolak nilai default ini.
        secret: requiredSecret(config),
        signOptions: {
          // @nestjs/jwt v12 types `expiresIn` as an `ms` StringValue; the
          // config string (e.g. '7d') is a valid ms duration.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '7d') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule diekspor supaya WebSocket gateway bisa memverifikasi token
  // handshake dengan secret yang sama dengan REST.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
