/**
 * Tipe integration — mengikuti nilai enum Prisma (uppercase) supaya konsisten
 * dengan kolom `Integration.type` di database.
 */
export type IntegrationType =
  | 'MQTT'
  | 'ESP32'
  | 'HOME_ASSISTANT'
  | 'TASMOTA'
  | 'SHELLY';

/** Perintah yang dieksekusi terhadap sebuah perangkat (capability + value). */
export interface IntegrationCommand {
  capability: string;
  value: unknown;
}

/**
 * Kredensial milik satu integrasi, sudah didekripsi di sisi server.
 *
 * Nilainya berasal dari `Integration.config` (lihat IntegrationsService),
 * jadi bentuknya bebas — adapter cukup mencari kunci yang dia miliki:
 * `url`/`brokerUrl` + `username` + `password` untuk MQTT, `username` +
 * `password` untuk HTTP auth Tasmota.
 *
 * Params opsional supaya adapter yang tidak butuh kredensial (atau versi
 * lama) tetap sah secara tipe.
 */
export type AdapterCredentials = Record<string, unknown>;

/** Perangkat fisik yang ditemukan oleh sebuah integration (blueprint §8). */
export interface DiscoveredDevice {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  state: Record<string, unknown>;
  /** Vendor/protokol (mis. 'tasmota', 'shelly') — untuk routing universal. */
  vendor?: string;
}

/**
 * Kontrak standar sebuah integration (blueprint §8):
 *
 *   connect() / disconnect() / discoverDevices() /
 *   getDeviceState() / executeCommand()
 *
 * Dengan kontrak ini, integration baru dapat ditambahkan tanpa mengubah core.
 */
export interface IntegrationAdapter {
  readonly type: IntegrationType;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  discoverDevices(credentials?: AdapterCredentials): Promise<DiscoveredDevice[]>;
  getDeviceState(
    deviceId: string,
    credentials?: AdapterCredentials,
  ): Promise<Record<string, unknown>>;
  executeCommand(
    deviceId: string,
    command: IntegrationCommand,
    credentials?: AdapterCredentials,
  ): Promise<Record<string, unknown>>;
}
