import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { DeviceCoreModule } from './device-core/device-core.module';
import { AuthModule } from './auth/auth.module';
import { HomesModule } from './homes/homes.module';
import { RoomsModule } from './rooms/rooms.module';
import { DevicesModule } from './devices/devices.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    DeviceCoreModule,
    AuthModule,
    HomesModule,
    RoomsModule,
    DevicesModule,
    IntegrationsModule,
    ActivityLogModule,
    HealthModule,
  ],
})
export class AppModule {}
