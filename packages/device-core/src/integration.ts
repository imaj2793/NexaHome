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

  discoverDevices(): Promise<DiscoveredDevice[]>;
  getDeviceState(deviceId: string): Promise<Record<string, unknown>>;
  executeCommand(
    deviceId: string,
    command: IntegrationCommand,
  ): Promise<Record<string, unknown>>;
}
