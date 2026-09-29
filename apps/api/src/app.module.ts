import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { DeviceCoreModule } from './device-core/device-core.module';
import { AuthModule } from './auth/auth.module';
import { HomesModule } from './homes/homes.module';
import { RoomsModule } from './rooms/rooms.module';
import { DevicesModule } from './devices/devices.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ScenesModule } from './scenes/scenes.module';
import { AutomationModule } from './automation/automation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EnergyModule } from './energy/energy.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { NexaModule } from './nexa/nexa.module';
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
    ScenesModule,
    AutomationModule,
    NotificationsModule,
    EnergyModule,
    DiscoveryModule,
    NexaModule,
    ActivityLogModule,
    HealthModule,
  ],
})
export class AppModule {}
