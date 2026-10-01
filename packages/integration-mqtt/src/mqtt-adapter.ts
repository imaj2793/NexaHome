import mqtt, { MqttClient } from 'mqtt';
import type { IClientOptions } from 'mqtt';
import {
  AdapterCredentials,
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
  /**
   * Verifikasi sertifikat broker (default `true`).
   *
   * `false` hanya berguna untuk broker lokal dengan sertifikat self-signed yang
   * belum dipercaya perangkat. Koneksi tetap terenkripsi, tapi tidak ada yang
   * membuktikan identitas broker. Jangan pakai di produksi.
   */
  tlsRejectUnauthorized?: boolean;
  /** CA khusus untuk memverifikasi sertifikat broker (format PEM). */
  tlsCa?: string;
  /** Sertifikat klien dan private key-nya, kalau broker meminta mTLS. */
  tlsCert?: string;
  tlsKey?: string;
  /** Masa berlaku penemuan (ms). Default 120 detik. */
  discoveryTtlMs?: number;
  /**
   * Jendela waktu untuk mendengarkan pengumuman saat scan ke broker non-default
   * (ms). Default 3 detik. Berbeda dengan TTL: ini batas menunggu broker,
   * bukan batas umur entri cache.
   */
  discoveryWindowMs?: number;
}

/** Mode yang didukung adapter MQTT. */
type MqttMode = 'mock' | 'mqtt';

const MQTT_MODES: readonly MqttMode[] = ['mock', 'mqtt'];

/**
 * Opsi TLS yang diteruskan ke mqtt.js.
 *
 * Memakai tipe pustaka supaya opsi baru dari mqtt.js tidak perlu dicatat ulang
 * di sini.
 */
type MqttTlsOptions = Pick<
  IClientOptions,
  'rejectUnauthorized' | 'ca' | 'cert' | 'key'
>;

/** Skema URL yang berarti koneksi terenkripsi. */
const SECURE_SCHEMES = new Set([
  'mqtts:',
  'wss:',
  'wsss:',
  'tls:',
  'ssl:',
  'https:',
]);

/** Apakah URL ini memakai koneksi terenkripsi? */
function isSecureUrl(url?: string): boolean {
  if (!url) return false;
  const match = /^([a-z0-9+.-]+):/i.exec(url);
  return match ? SECURE_SCHEMES.has(`${match[1].toLowerCase()}:`) : false;
}

/**
 * Rakit opsi TLS dari config, membuang key yang tidak diisi.
 *
 * `undefined` tidak diteruskan: mqtt.js melihat keberadaan key `ca` dan `cert`,
 * jadi config yang kosong harus benar-benar hilang dari objek.
 */
function buildTlsOptions(config: MqttAdapterConfig): MqttTlsOptions {
  const options: MqttTlsOptions = {};
  if (config.tlsRejectUnauthorized !== undefined) {
    options.rejectUnauthorized = config.tlsRejectUnauthorized;
  }
  if (config.tlsCa) options.ca = config.tlsCa;
  if (config.tlsCert) options.cert = config.tlsCert;
  if (config.tlsKey) options.key = config.tlsKey;
  return options;
}

/** Timeout publish — tanpa ini MQTTv3 tidak pernah memberi callback error. */
const PUBLISH_TIMEOUT_MS = 5_000;

/** Batas menunggu state yang dikirim broker non-default. */
const STATE_READ_TIMEOUT_MS = 3_000;

/**
 * Broker tujuan untuk satu perintah.
 *
 * `isPrimary: true` berarti pakai koneksi yang sudah dijaga adapter
 * (subscribe state + discovery). Kalau tidak, koneksi dibuat sekali pakai.
 */
interface MqttTarget {
  isPrimary: boolean;
  url?: string;
  username?: string;
  password?: string;
}

/** Bentuk konfigurasi setelah dinormalisasi oleh constructor. */
interface ResolvedConfig {
  mode: MqttMode;
  url?: string;
  /** Kredensial broker; dipakai kalau broker tidak mengizinkan anonymous. */
  username?: string;
  password?: string;
  /** Opsi TLS hasil normalisasi, diteruskan apa adanya ke mqtt.js. */
  tls: MqttTlsOptions;
  /**
   * Berapa lama perangkat tetap dilaporkan hasil scan sejak pesan terakhirnya.
   * Default 120 detik. Tanpa ini, perangkat yang dihapus/dimatikan tetap
   * muncul di hasil scan sampai API di-restart.
   */
  discoveryTtlMs: number;
  /** Jendela dengarkan pengumuman saat scan ke broker non-default (ms). */
  discoveryWindowMs: number;
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
 *
 * Kredensial per integrasi (lihat `AdapterCredentials`) memakai broker milik
 * integrasi tersebut bila berbeda dari broker utama yang sudah dijaga
 * adapter. Koneksi ke broker kedua dibuat sekali pakai per operasi, lalu
 * ditutup — jadi state yang dikirim broker itu tidak meng-update state yang
 * tersimpan di adapter, dan state optimistis sesudah `executeCommand`
 * berasal dari cache primary, bukan dari broker kedua.
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
      discoveryWindowMs: Number(config.discoveryWindowMs) || 3_000,
      tls: buildTlsOptions(config),
    };
    this.assertTlsSettingsAreSane();
    if (this.config.mode === 'mqtt' && !this.config.url) {
      throw new Error(
        'Mode "mqtt" memerlukan `url` broker (mis. mqtt://localhost:1883).',
      );
    }
    if (this.config.mode === 'mock') this.seedMock();
  }

  /**
   * `tlsRejectUnauthorized: false` tanpa TLS bukan cuma tidak berguna: opsi itu
   * terlihat seperti lupa dikonfigurasi, padahal diam-diam melemahkan koneksi.
   * Dicek saat start supaya kesalahan konfigurasi ketahuan sekarang, bukan
   * nanti saat perangkat tidak merespons.
   */
  private assertTlsSettingsAreSane(): void {
    if (this.config.tls.rejectUnauthorized !== false) return;
    if (this.config.mode === 'mqtt' && !isSecureUrl(this.config.url)) {
      throw new Error(
        'MQTT_TLS_REJECT_UNAUTHORIZED=false hanya boleh dipakai pada URL ' +
          'ber-TLS (mqtts:// atau wss://). Koneksi mqtt:// tidak punya ' +
          'sertifikat yang bisa diverifikasi.',
      );
    }
  }

  /**
   * Gabungkan kredensial dan opsi TLS untuk satu koneksi.
   *
   * Opsi TLS hanya ikut kalau skema URL-nya aman. Mengirim
   * `rejectUnauthorized` ke koneksi biasa tidak berguna dan hanya menambah
   * bindir yang membingungkan saat debugging.
   */
  private connectOptions(
    credentials: IClientOptions,
    url?: string,
  ): IClientOptions {
    if (!isSecureUrl(url)) return credentials;
    return { ...credentials, ...this.config.tls };
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

  async discoverDevices(
    credentials?: AdapterCredentials,
  ): Promise<DiscoveredDevice[]> {
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

    const target = this.resolveTarget(credentials);
    const cached = [...this.discovered.values()].map((d) => ({
      ...d,
      state: { ...d.state },
    }));

    // Broker non-default: cache primary tidak memuat perangkatnya, jadi
    // hasilnya hanya pengumuman dari broker itu. Cache primary sengaja tidak
    // dipakai sebagai cadangan: perangkat di sana milik integrasi lain.
    if (!target.isPrimary) {
      return this.discoverOnEphemeralConnection(target);
    }

    return cached;
  }

  /**
   * Dengarkan pengumuman perangkat di broker non-default selama satu jendela
   * waktu, lalu tutup koneksi.
   *
   * Broker hanya mengirim pengumuman saat perangkat menyala atau karena
   * perangkat lain memintanya, jadi scan singkat hanya menemukan yang sedang
   * muncul di dalam jendela tersebut. Ini batas nyata dari protocol yang
   * dipakai, bukan hasil yang bisa diandalkan penuh.
   */
  private async discoverOnEphemeralConnection(
    target: MqttTarget,
  ): Promise<DiscoveredDevice[]> {
    const client = mqtt.connect(
      target.url!,
      this.connectOptions(
        target.username && target.password
          ? { username: target.username, password: target.password }
          : {},
        target.url,
      ),
    );
    try {
      return await new Promise<DiscoveredDevice[]>((resolve, reject) => {
        const found = new Map<string, DiscoveredDevice>();
        const finish = () => {
          clearTimeout(timer);
          client.off('message', onMessage);
          client.off('error', onError);
          resolve([...found.values()]);
        };

        const onMessage = (topic: string, payload: Buffer) => {
          if (topic !== DISCOVERY_TOPIC) return;
          try {
            const data = JSON.parse(payload.toString()) as {
              id?: string;
              name?: string;
              type?: string;
              capabilities?: string[];
              state?: Record<string, unknown>;
            };
            if (data.id) {
              found.set(data.id, {
                id: data.id,
                name: data.name ?? data.id,
                type: data.type ?? 'unknown',
                capabilities: data.capabilities ?? [],
                state: data.state ?? {},
              });
            }
          } catch {
            // Pengumuman rusak diabaikan agar scan tetap berjalan.
          }
        };

        const onError = (err: Error) => {
          clearTimeout(timer);
          reject(err);
        };

        const timer = setTimeout(finish, this.config.discoveryWindowMs);

        client.on('error', onError);
        client.on('message', onMessage);
        client.subscribe(DISCOVERY_TOPIC, (err) => {
          if (err) onError(err);
        });
      });
    } finally {
      await this.closeEphemeralConnection(client);
    }
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

  async getDeviceState(
    deviceId: string,
    credentials?: AdapterCredentials,
  ): Promise<Record<string, unknown>> {
    if (this.config.mode === 'mock') {
      return { ...(this.mockState.get(deviceId) ?? {}) };
    }

    const target = this.resolveTarget(credentials);
    if (!target.isPrimary) {
      // Broker non-default tidak punya listener state milik primary, jadi satu
      // state dibaca lewat koneksi sekali pakai yang langsung ditutup.
      return this.readStateOnce(target, deviceId);
    }

    this.ensureConnected();
    this.client!.subscribe(stateTopic(deviceId));
    return this.waitForState(deviceId);
  }

  async executeCommand(
    deviceId: string,
    command: IntegrationCommand,
    credentials?: AdapterCredentials,
  ): Promise<Record<string, unknown>> {
    if (this.config.mode === 'mock') {
      return this.executeMock(deviceId, command);
    }

    const payload = JSON.stringify({
      capability: command.capability,
      value: command.value,
    });

    const target = this.resolveTarget(credentials);
    if (target.isPrimary) {
      this.ensureConnected();
      await this.publish(this.client!, setTopic(deviceId), payload);
    } else {
      // Broker lain: koneksi sekali pakai, lalu ditutup. Broker ini tidak
      // punya listener state milik primary, jadi yang dikembalikan di bawah
      // tetap state optimistis dari cache primary.
      await this.publishOnEphemeralConnection(target, setTopic(deviceId), payload);
    }

    // Optimistis: gabungkan perintah ke state terakhir yang diketahui.
    const current = this.stateByDevice.get(deviceId) ?? {};
    return { ...current, [command.capability]: command.value };
  }

  /**
   * Publish dengan batas waktu.
   *
   * mqtt v5 tidak punya opsi `timeout` di publish, jadi batasnya dibuat di
   * sini: tanpa ini, TCP yang menggantung akan menahan request HTTP sampai
   * client atau proxy kehabisan waktu — bukan error yang bisa dilihat.
   */
  private publish(
    client: MqttClient,
    topic: string,
    payload: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Publish ke ${topic} tidak selesai dalam ${PUBLISH_TIMEOUT_MS}ms.`,
          ),
        );
      }, PUBLISH_TIMEOUT_MS);

      client.publish(topic, payload, { qos: 0 }, (err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Kredensial integrasi menentukan broker mana yang dipakai.
   *
   * Kalau tidak ada kredensial, atau kredensialnya menunjuk ke broker yang
   * sama dengan koneksi utama (kasus umum: satu broker untuk semua rumah),
   * perintah dikirim lewat koneksi yang sudah ada — tidak ada biaya tambahan.
   */
  private resolveTarget(credentials?: AdapterCredentials): MqttTarget {
    const empty: MqttTarget = { isPrimary: true, url: undefined };
    if (!credentials) return empty;

    const url =
      typeof credentials.brokerUrl === 'string'
        ? credentials.brokerUrl
        : typeof credentials.url === 'string'
          ? credentials.url
          : undefined;
    const username =
      typeof credentials.username === 'string' ? credentials.username : undefined;
    const password =
      typeof credentials.password === 'string' ? credentials.password : undefined;

    // Tanpa URL berarti "broker yang sama, pakai kredensial yang disimpan".
    const effectiveUrl = url ?? this.config.url;
    if (!effectiveUrl) return empty;

    // Kredensial yang tidak diisi integrasi berarti "pakai yang global" HANYA untuk
    // broker yang sama. Tanpa fallback ini, integrasi yang tidak menyimpan URL
    // sendiri dianggap broker asing lalu dibuka lewat koneksi sekali pakai
    // tanpa username — yang ditolak broker ber-password (dan dulu lolos
    // diam-diam di listener plaintext anonymous).
    //
    // Untuk broker lain, kredensial global justru TIDAK boleh ikut: itu
    // password broker kita yang akan dikirim ke host yang bukan milik kita.
    const onPrimaryBroker = effectiveUrl === this.config.url;
    const effectiveUsername = onPrimaryBroker
      ? (username ?? this.config.username)
      : username;
    const effectivePassword = onPrimaryBroker
      ? (password ?? this.config.password)
      : password;

    const sameBroker =
      onPrimaryBroker &&
      effectiveUsername === this.config.username &&
      effectivePassword === this.config.password;

    return sameBroker
      ? empty
      : {
          isPrimary: false,
          url: effectiveUrl,
          username: effectiveUsername,
          password: effectivePassword,
        };
  }

  /**
   * Koneksi sekali pakai ke broker non-default.
   *
   * Dijalankan lalu ditutup di `finally` supaya koneksi tidak menumpuk tiap
   * perintah. Kerugiannya: broker kedua tidak ikut di-subscribe, jadi
   * `executeCommand` di sana hanya mengembalikan state optimistis dari cache
   * primary. `getDeviceState` menutup celah itu dengan membaca satu state
   * lewat koneksi sekali pakainya sendiri.
   */
  private async publishOnEphemeralConnection(
    target: MqttTarget,
    topic: string,
    payload: string,
  ): Promise<void> {
    const client = mqtt.connect(
      target.url!,
      this.connectOptions(
        target.username && target.password
          ? { username: target.username, password: target.password }
          : {},
        target.url,
      ),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const fail = (err: Error) => reject(err);
        client.once('error', fail);
        client.once('connect', () => resolve());
      });
      await this.publish(client, topic, payload);
    } finally {
      await this.closeEphemeralConnection(client);
    }
  }

  /**
   * Baca satu state dari broker non-default lewat koneksi sekali pakai.
   *
   * Kalau broker tidak menjawab dalam batas waktu, state kosong dikembalikan
   * — sama seperti `waitForState` di primary — supaya perangkat yang tidak
   * merespons tidak menggantung request.
   */
  private async readStateOnce(
    target: MqttTarget,
    deviceId: string,
  ): Promise<Record<string, unknown>> {
    const client = mqtt.connect(
      target.url!,
      this.connectOptions(
        target.username && target.password
          ? { username: target.username, password: target.password }
          : {},
        target.url,
      ),
    );
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const topic = stateTopic(deviceId);
        const finish = (value: Record<string, unknown>) => {
          clearTimeout(timer);
          client.off('message', onMessage);
          client.off('error', onError);
          resolve(value);
        };

        const onMessage = (incoming: string, payload: Buffer) => {
          if (incoming !== topic) return;
          try {
            finish(JSON.parse(payload.toString()) as Record<string, unknown>);
          } catch {
            // Pesan rusak diabaikan; bukan alasan gagalkan seluruh pembacaan.
          }
        };

        const onError = (err: Error) => {
          clearTimeout(timer);
          reject(err);
        };

        const timer = setTimeout(() => finish({}), STATE_READ_TIMEOUT_MS);

        client.on('error', onError);
        client.on('message', onMessage);
        client.subscribe(topic, (err) => {
          if (err) onError(err);
        });
      });
    } finally {
      await this.closeEphemeralConnection(client);
    }
  }

  private closeEphemeralConnection(client: MqttClient): Promise<void> {
    return new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
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
      const client = mqtt.connect(
        this.config.url!,
        this.connectOptions(credentials, this.config.url),
      );
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
