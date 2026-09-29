import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationManager } from '@nexahome/device-core';
import { WizAdapter } from '@nexahome/integration-wiz';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';
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
    {
      provide: MqttAdapter,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new MqttAdapter({
          mode: (config.get<string>('MQTT_MODE') as 'mock' | 'mqtt') ?? 'mock',
          url: config.get<string>('MQTT_URL'),
        }),
    },
    {
      provide: TasmotaAdapter,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new TasmotaAdapter({
          mode: (config.get<string>('TASMOTA_MODE') as 'mock' | 'http') ??
            'mock',
        }),
    },
  ],
  exports: [DeviceCoreService, DeviceGateway, IntegrationManager],
})
export class DeviceCoreModule {}
