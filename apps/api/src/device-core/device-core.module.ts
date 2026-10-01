import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationManager } from '@nexahome/device-core';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import type { MqttAdapterConfig } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';
import type { TasmotaAdapterConfig } from '@nexahome/integration-tasmota';
import { AuthModule } from '../auth/auth.module';
import { CredentialReaderModule } from '../integrations/credential-reader.module';
import { DeviceCoreService } from './device-core.service';
import { DeviceGateway } from './device.gateway';

type MqttMode = NonNullable<MqttAdapterConfig['mode']>;
type TasmotaMode = NonNullable<TasmotaAdapterConfig['mode']>;

/**
 * `MQTT_TLS_REJECT_UNAUTHORIZED` hanya punya dua nilai yang masuk akal:
 * `true` (default mqtt.js) dan `false` untuk broker lokal self-signed.
 *
 * Env kosong berarti "biarkan default", bukan `false` — kalau tidak begitu,
 * baris kosong di `.env` diam-diam mematikan verifikasi sertifikat.
 */
function parseTlsRejectUnauthorized(value?: string): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new Error(
    `MQTT_TLS_REJECT_UNAUTHORIZED harus true atau false, bukan "${value}".`,
  );
}

/**
 * CA untuk verifikasi sertifikat broker.
 *
 * `MQTT_TLS_CA_PATH` dibaca sekali di saat modul dibangun: mqtt.js menerima isi
 * PEM, bukan nama file, jadi path yang diteruskan mentah akan membuat Node
 * memperlakukan string path itu sebagai trust anchor dan menolak sertifikat
 * apa pun. `MQTT_TLS_CA` tetap dipakai untuk PEM inline lewat env, karena
 * tidak selalu ada cara mount file ke container.
 */
function resolveTlsCa(
  path: string | undefined,
  inline: string | undefined,
): string | undefined {
  const pem = inline?.trim();
  if (pem) return pem;
  if (!path?.trim()) return undefined;
  try {
    return readFileSync(path.trim(), 'utf8');
  } catch (error) {
    throw new Error(
      `MQTT_TLS_CA_PATH tidak bisa dibaca (${path}): ${
        error instanceof Error ? error.message : String(error)
      }.`,
    );
  }
}

@Module({
  imports: [AuthModule, CredentialReaderModule],
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
          // `false` hanya untuk broker lokal dengan sertifikat self-signed yang
          // belum dipercaya perangkat. Kosong = biarkan mqtt.js memakai default
          // (verifikasi aktif).
          tlsRejectUnauthorized: parseTlsRejectUnauthorized(
            config.get<string>('MQTT_TLS_REJECT_UNAUTHORIZED'),
          ),
          tlsCa: resolveTlsCa(
            config.get<string>('MQTT_TLS_CA_PATH'),
            config.get<string>('MQTT_TLS_CA'),
          ),
          tlsCert: config.get<string>('MQTT_TLS_CERT') || undefined,
          tlsKey: config.get<string>('MQTT_TLS_KEY') || undefined,
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
