import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationManager } from '@nexahome/device-core';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import type { MqttAdapterConfig } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';
import type { TasmotaAdapterConfig } from '@nexahome/integration-tasmota';
import { AuthModule } from '../auth/auth.module';
import { DeviceCoreService } from './device-core.service';
import { DeviceGateway } from './device.gateway';

type MqttMode = NonNullable<MqttAdapterConfig['mode']>;
type TasmotaMode = NonNullable<TasmotaAdapterConfig['mode']>;

@Module({
  imports: [AuthModule],
  providers: [
    DeviceGateway,
    DeviceCoreService,
    IntegrationManager,
    {
      provide: MqttAdapter,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = config.get<string>('MQTT_DISCOVERY_TTL_MS');
        return new MqttAdapter({
          mode: config.get<string>('MQTT_MODE') as MqttMode,
          url: config.get<string>('MQTT_URL'),
          // `||` bukan `??`: env yang dikosongkan di .env tetap string "".
          discoveryTtlMs: ttl ? Number(ttl) : undefined,
          username: config.get<string>('MQTT_USERNAME') || undefined,
          password: config.get<string>('MQTT_PASSWORD') || undefined,
        });
      },
    },
    {
      provide: TasmotaAdapter,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new TasmotaAdapter({
          mode: config.get<string>('TASMOTA_MODE') as TasmotaMode,
        }),
    },
  ],
  exports: [DeviceCoreService, DeviceGateway, IntegrationManager],
})
export class DeviceCoreModule {}
