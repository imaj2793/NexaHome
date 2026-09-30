import mqtt, { MqttClient } from 'mqtt';
import {
  DiscoveredDevice,
  IntegrationAdapter,
  IntegrationCommand,
  IntegrationType,
  parseMode,
} from '@nexahome/device-core';

/** Konfigurasi adapter MQTT. */
export interface MqttAdapterConfig {
  /**
   * 'mock' = tanpa koneksi ke broker (scan selalu kosong);
   * 'mqtt' = broker asli.
   */
  mode?: 'mock' | 'mqtt';
  /** URL broker MQTT (mis. `mqtt://localhost:1883`). Wajib saat mode 'mqtt'. */
  url?: string;
  /** Username broker. Wajib bila broker menolak koneksi anonymous. */
  username?: string;
  /** Password broker. */
  password?: string;
  /** Masa berlaku penemuan (ms). Default 120 detik. */
  discoveryTtlMs?: number;
}

/** Mode yang didukung adapter MQTT. */
type MqttMode = 'mock' | 'mqtt';

const MQTT_MODES: readonly MqttMode[] = ['mock', 'mqtt'];

/** Bentuk konfigurasi setelah dinormalisasi oleh constructor. */
interface ResolvedConfig {
  mode: MqttMode;
  url?: string;
  /** Kredensial broker; dipakai kalau broker tidak mengizinkan anonymous. */
  username?: string;
  password?: string;
  /**
   * Berapa lama perangkat tetap dilaporkan hasil scan sejak pesan terakhirnya.
   * Default 120 detik. Tanpa ini, perangkat yang dihapus/dimatikan tetap
   * muncul di hasil scan sampai API di-restart.
   */
  discoveryTtlMs: number;
}

/** Benih perangkat mock (mode mock, tanpa network). */
interface MockDeviceSeed {
  id: string;
  name: string;
  capabilities: string[];
  state: Record<string, unknown>;
}

/** Topik tempat perangkat melaporkan state-nya. */
const stateTopic = (deviceId: string): string =>
  `nexahome/devices/${deviceId}/state`;

/** Topik tempat adapter mengirim perintah ke perangkat. */
const setTopic = (deviceId: string): string =>
  `nexahome/devices/${deviceId}/set`;

/** Topik pengumuman (discovery) perangkat baru. */
const DISCOVERY_TOPIC = 'nexahome/discovery';

const DEFAULT_MOCK_DEVICES: MockDeviceSeed[] = [
  {
    id: 'mqtt_sensor_suhu_01',
    name: 'Sensor Suhu Ruang Tamu',
    capabilities: ['temperature', 'humidity'],
    state: { temperature: 26.5, humidity: 62, online: true },
  },
  {
    id: 'mqtt_sensor_motion_02',
    name: 'Sensor Gerak Koridor',
    capabilities: ['motion'],
    state: { motion: false, online: true },
  },
];

/**
 * Adapter MQTT (blueprint §8). Mengimplementasikan kontrak `IntegrationAdapter`
 * dari `@nexahome/device-core`.
 *
 * Dua mode operasi:
 *  - `mock` (default): simulasi in-memory, tanpa koneksi network apa pun.
 *  - `mqtt`: terhubung ke broker via package `mqtt`, publish perintah ke topik
 *    `nexahome/devices/{deviceId}/set`, dan subscribe
 *    `nexahome/devices/{deviceId}/state` untuk membaca state perangkat.
 */
export class MqttAdapter implements IntegrationAdapter {
  readonly type: IntegrationType = 'MQTT';

  private readonly config: ResolvedConfig;

  // ── mode mock ──────────────────────────────────────────
  private readonly mockState = new Map<string, Record<string, unknown>>();

  // ── mode mqtt ──────────────────────────────────────────
  private client?: MqttClient;
  /** State terakhir per perangkat yang diterima dari broker. */
  private readonly stateByDevice = new Map<string, Record<string, unknown>>();
  /** Perangkat yang sudah diketahui (via discovery/state). */
  private readonly discovered = new Map<string, DiscoveredDevice>();
  /** Waktu pesan terakhir yang diterima per perangkat (epoch ms). */
  private readonly lastSeen = new Map<string, number>();
  /** Penunggu state per perangkat (untuk getDeviceState). */
  private readonly pendingStateWaits = new Map<
    string,
    (state: Record<string, unknown>) => void
  >();

  constructor(config: MqttAdapterConfig = {}) {
    // Nilai mode berasal dari env, jadi divalidasi agar salah ketik
    // (mis. "live") tidak membuat adapter diam-diam jadi no-op.
    const mode = parseMode<MqttMode>(config.mode, MQTT_MODES, 'mock', 'MQTT_MODE');
    this.config = {
      mode,
      url: config.url,
      username: config.username,
      password: config.password,
      // `||` bukan `??`: env yang dikosongkan di .env tetap string "".
      discoveryTtlMs: Number(config.discoveryTtlMs) || 120_000,
    };
    if (this.config.mode === 'mqtt' && !this.config.url) {
      throw new Error(
        'Mode "mqtt" memerlukan `url` broker (mis. mqtt://localhost:1883).',
      );
    }
    if (this.config.mode === 'mock') this.seedMock();
  }

  // ── kontrak IntegrationAdapter ─────────────────────────

  async connect(): Promise<void> {
    if (this.config.mode !== 'mqtt') return;
    await this.connectBroker();
  }

  async disconnect(): Promise<void> {
    if (this.config.mode !== 'mqtt' || !this.client) return;
    const client = this.client;
    this.client = undefined;
    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    // Mode mock sengaja TIDAK memalsukan hasil scan. Dulu ia mengembalikan
    // sensor fiktif dari mockState sehingga UI menampilkan perangkat yang
    // tidak ada. Kontrak baru: mock = tidak ada yang ditemukan; hanya mode
    // mqtt yang melaporkan perangkat yang benar-benar diumumkan ke broker.
    if (this.config.mode === 'mock') {
      return [];
    }

    // mode mqtt: perangkat yang diumumkan lewat topic nexahome/discovery atau
    // yang mengirim state. Entri yang basi dibuang — tanpa ini, perangkat yang
    // sudah dihapus/offline tetap muncul di hasil scan sampai API di-restart.
    this.pruneStale();
    return [...this.discovered.values()].map((d) => ({
      ...d,
      state: { ...d.state },
    }));
  }

  /** Buang perangkat yang tidak lagi mengirim pesan dalam TTL. */
  private pruneStale(): void {
    const cutoff = Date.now() - this.config.discoveryTtlMs;
    for (const [id, seen] of [...this.lastSeen]) {
      if (seen >= cutoff) continue;
      this.lastSeen.delete(id);
      this.discovered.delete(id);
      this.stateByDevice.delete(id);
    }
  }

  async getDeviceState(deviceId: string): Promise<Record<string, unknown>> {
    if (this.config.mode === 'mock') {
      return { ...(this.mockState.get(deviceId) ?? {}) };
    }

    this.ensureConnected();
    this.client!.subscribe(stateTopic(deviceId));
    return this.waitForState(deviceId);
  }

  async executeCommand(
    deviceId: string,
    command: IntegrationCommand,
  ): Promise<Record<string, unknown>> {
    if (this.config.mode === 'mock') {
      return this.executeMock(deviceId, command);
    }

    this.ensureConnected();
    const payload = JSON.stringify({
      capability: command.capability,
      value: command.value,
    });

    await new Promise<void>((resolve, reject) => {
      this.client!.publish(setTopic(deviceId), payload, {}, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Optimistis: gabungkan perintah ke state terakhir yang diketahui.
    const current = this.stateByDevice.get(deviceId) ?? {};
    return { ...current, [command.capability]: command.value };
  }

  // ── mode mock ──────────────────────────────────────────

  private seedMock(): void {
    for (const d of DEFAULT_MOCK_DEVICES) {
      this.mockState.set(d.id, { ...d.state });
    }
  }

  private executeMock(
    deviceId: string,
    command: IntegrationCommand,
  ): Record<string, unknown> {
    const current = this.mockState.get(deviceId) ?? {};
    // Pada mode mock, setiap perintah hanya memperbarui state virtual.
    const next: Record<string, unknown> = {
      ...current,
      [command.capability]: command.value,
    };
    this.mockState.set(deviceId, next);
    return { ...next };
  }

  // ── mode mqtt ──────────────────────────────────────────

  private connectBroker(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Env yang dikosongkan di .env tetap string "", jadi pakai `||` agar
      // tidak terkirim sebagai username kosong.
      const credentials =
        this.config.username && this.config.password
          ? {
              username: this.config.username,
              password: this.config.password,
            }
          : {};
      const client = mqtt.connect(this.config.url!, credentials);
      this.client = client;

      client.on('error', reject);
      client.on('message', (topic: string, payload: Buffer) => {
        this.onMessage(topic, payload);
      });

      client.on('connect', () => {
        // Dengarkan state semua perangkat + topik pengumuman (discovery).
        client.subscribe('nexahome/devices/+/state');
        client.subscribe(DISCOVERY_TOPIC);
        resolve();
      });
    });
  }

  private onMessage(topic: string, payload: Buffer): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return; // abaikan payload non-JSON
    }

    if (topic === DISCOVERY_TOPIC) {
      this.onDiscovery(data);
      return;
    }

    const deviceId = this.deviceIdFromStateTopic(topic);
    if (!deviceId) return;

    this.lastSeen.set(deviceId, Date.now());
    this.stateByDevice.set(deviceId, data);

    const waiter = this.pendingStateWaits.get(deviceId);
    if (waiter) {
      waiter(data);
      this.pendingStateWaits.delete(deviceId);
    }

    const known = this.discovered.get(deviceId);
    if (known) {
      known.state = data;
    } else {
      this.discovered.set(deviceId, {
        id: deviceId,
        name: deviceId,
        type: 'unknown',
        capabilities: [],
        state: data,
      });
    }
  }

  private onDiscovery(data: Record<string, unknown>): void {
    const id = typeof data.id === 'string' ? data.id : undefined;
    if (!id) return;

    const name = typeof data.name === 'string' ? data.name : id;
    const type = typeof data.type === 'string' ? data.type : 'unknown';
    const capabilities = Array.isArray(data.capabilities)
      ? data.capabilities.filter((c): c is string => typeof c === 'string')
      : [];
    const state =
      data.state && typeof data.state === 'object'
        ? (data.state as Record<string, unknown>)
        : {};

    this.discovered.set(id, { id, name, type, capabilities, state });
    this.stateByDevice.set(id, state);
    this.lastSeen.set(id, Date.now());
  }

  private deviceIdFromStateTopic(topic: string): string | undefined {
    const match = /^nexahome\/devices\/([^/]+)\/state$/.exec(topic);
    return match ? match[1] : undefined;
  }

  private waitForState(
    deviceId: string,
    timeoutMs = 3000,
  ): Promise<Record<string, unknown>> {
    const cached = this.stateByDevice.get(deviceId);
    if (cached) return Promise.resolve({ ...cached });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingStateWaits.delete(deviceId);
        resolve({});
      }, timeoutMs);

      this.pendingStateWaits.set(deviceId, (state) => {
        clearTimeout(timer);
        resolve({ ...state });
      });
    });
  }

  private ensureConnected(): void {
    if (!this.client || !this.client.connected) {
      throw new Error(
        'Adapter MQTT belum terhubung — panggil connect() terlebih dahulu.',
      );
    }
  }
}
