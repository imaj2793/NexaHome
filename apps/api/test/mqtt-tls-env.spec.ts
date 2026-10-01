import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import { DeviceCoreModule } from '../src/device-core/device-core.module';

/**
 * Env TLS untuk adapter MQTT dibaca di factory modul ini, jadi test diambil
 * dari provider aslinya — bukan dari helper yang disalin ulang, yang bisa
 * lulus sementara factory-nya sudah berubah.
 *
 * Fokus: CA harus dibaca sebagai isi file (mqtt.js tidak bisa memakai path),
 * dan nilai verifikasi yang tidak masuk akal harus gagal saat start, bukan
 * diam-diam jadi `false`.
 */

/** Provider MqttAdapter di dalam definisi modul. */
function mqttProviderFactory(): (config: {
  get: (key: string) => string | undefined;
}) => MqttAdapter {
  // Decorator `@Module` menyimpan daftar provider sebagai metadata kelas,
  // bukan properti biasa.
  const providers = Reflect.getMetadata('providers', DeviceCoreModule) as
    | unknown[]
    | undefined;
  const provider = (providers ?? []).find(
    (p): p is { provide: unknown; useFactory: () => MqttAdapter } =>
      typeof p === 'object' &&
      p !== null &&
      (p as { provide?: unknown }).provide === MqttAdapter,
  );
  if (!provider) throw new Error('Provider MqttAdapter tidak ditemukan.');
  return provider.useFactory;
}

const baseEnv: Record<string, string> = {
  MQTT_MODE: 'mqtt',
  MQTT_URL: 'mqtts://mqtt:8883',
  MQTT_USERNAME: 'nexahome',
  MQTT_PASSWORD: 'pw',
};

const build = (env: Record<string, string>) => {
  const factory = mqttProviderFactory();
  return factory({ get: (key: string) => env[key] });
};

/** Isi adapter tanpa menyentuh jaringan. */
const internals = (adapter: MqttAdapter) =>
  adapter as unknown as { config: { url?: string; tls: Record<string, unknown> } };

describe('DeviceCoreModule — konfigurasi TLS MQTT', () => {
  it('membaca CA dari file yang ditunjuk MQTT_TLS_CA_PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexahome-mqtt-tls-'));
    const caPath = join(dir, 'ca.crt');
    const pem = '-----BEGIN CERTIFICATE-----\nisi-ca\n-----END CERTIFICATE-----\n';
    writeFileSync(caPath, pem);

    const adapter = build({
      ...baseEnv,
      MQTT_TLS_CA_PATH: caPath,
      MQTT_TLS_REJECT_UNAUTHORIZED: 'true',
    });

    // mqtt.js memperlakukan nilai `ca` sebagai trust anchor. Kalau yang
    // diteruskan path file, Node memverifikasi terhadap string path itu dan
    // menolak sertifikat apa pun — errornya baru muncul saat koneksi pertama.
    expect(internals(adapter).config.tls).toEqual({
      rejectUnauthorized: true,
      ca: pem,
    });
  });

  it('PEM inline lewat MQTT_TLS_CA dipakai apa adanya', () => {
    const adapter = build({
      ...baseEnv,
      MQTT_TLS_CA: '-----BEGIN CERTIFICATE-----\ninline\n-----END CERTIFICATE-----',
    });

    expect(internals(adapter).config.tls.ca).toBe(
      '-----BEGIN CERTIFICATE-----\ninline\n-----END CERTIFICATE-----',
    );
  });

  it('tanpa env TLS, opsi TLS kosong dan URL tetap apa adanya', () => {
    const adapter = build(baseEnv);

    expect(internals(adapter).config.url).toBe('mqtts://mqtt:8883');
    expect(internals(adapter).config.tls).toEqual({});
  });

  it('MQTT_TLS_REJECT_UNAUTHORIZED kosong berarti biarkan default mqtt.js', () => {
    const adapter = build({ ...baseEnv, MQTT_TLS_REJECT_UNAUTHORIZED: '  ' });

    // Default mqtt.js = verifikasi aktif. Mengubahnya jadi `false` di sini
    // berarti satu baris kosong di .env mematikan TLS.
    expect(internals(adapter).config.tls).toEqual({});
  });

  it('nilai verifikasi yang tidak masuk akal gagal saat start', () => {
    expect(() =>
      build({ ...baseEnv, MQTT_TLS_REJECT_UNAUTHORIZED: 'ya' }),
    ).toThrow(/harus true atau false/);
  });

  it('CA_PATH yang tidak bisa dibaca namanya disebut, bukan diam-diam diabaikan', () => {
    expect(() =>
      build({ ...baseEnv, MQTT_TLS_CA_PATH: '/tmp/tidak-ada-ca-nexahome.crt' }),
    ).toThrow(/MQTT_TLS_CA_PATH tidak bisa dibaca/);
  });
});