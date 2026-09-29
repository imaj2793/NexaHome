import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationManager } from '@nexahome/device-core';
import { WizAdapter } from '@nexahome/integration-wiz';
import type { WizAdapterConfig } from '@nexahome/integration-wiz';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import type { MqttAdapterConfig } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';
import type { TasmotaAdapterConfig } from '@nexahome/integration-tasmota';
import { DeviceCoreService } from './device-core.service';
import { DeviceGateway } from './device.gateway';

type MqttMode = NonNullable<MqttAdapterConfig['mode']>;
type TasmotaMode = NonNullable<TasmotaAdapterConfig['mode']>;
type WizMode = NonNullable<WizAdapterConfig['mode']>;

@Module({
  providers: [
    DeviceGateway,
    DeviceCoreService,
    IntegrationManager,
    {
      provide: WizAdapter,
      inject: [ConfigService],
      // Nilai mode diteruskan apa adanya; adapter yang memvalidasinya
      // (parseMode) agar salah ketik env menggagalkan startup dengan jelas.
      useFactory: (config: ConfigService) =>
        new WizAdapter({
          mode: config.get<string>('WIZ_MODE') as WizMode,
        }),
    },
    {
      provide: MqttAdapter,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new MqttAdapter({
          mode: config.get<string>('MQTT_MODE') as MqttMode,
          url: config.get<string>('MQTT_URL'),
        }),
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
