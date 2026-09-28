import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationManager } from '@nexahome/device-core';
import { WizAdapter } from '@nexahome/integration-wiz';
import { DeviceCoreService } from './device-core.service';
import { DeviceGateway } from './device.gateway';

@Module({
  providers: [
    DeviceGateway,
    DeviceCoreService,
    IntegrationManager,
    {
      provide: WizAdapter,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new WizAdapter({
          mode: (config.get<string>('WIZ_MODE') as 'mock' | 'udp') ?? 'mock',
        }),
    },
  ],
  exports: [DeviceCoreService, DeviceGateway],
})
export class DeviceCoreModule {}
