import {
  AdapterCredentials,
  DiscoveredDevice,
  IntegrationAdapter,
  IntegrationCommand,
  IntegrationType,
  parseMode,
} from '@nexahome/device-core';

/** Mode yang didukung adapter Tasmota. */
type TasmotaMode = 'mock' | 'http';

const TASMOTA_MODES: readonly TasmotaMode[] = ['mock', 'http'];

export interface TasmotaAdapterConfig {
  /** 'mock' = simulasi in-memory; 'http' = kontrol via HTTP API Tasmota. */
  mode?: TasmotaMode;
}

interface MockDeviceSeed {
  id: string;
  name: string;
  capabilities: string[];
  state: Record<string, unknown>;
}

const DEFAULT_MOCK_DEVICES: MockDeviceSeed[] = [
  {
    id: 'tasmota_relay_01',
    name: 'Tasmota Relay',
    capabilities: ['power'],
    state: { power: false },
  },
  {
    id: 'tasmota_dimmer_01',
    name: 'Tasmota Dimmer',
    capabilities: ['power', 'brightness'],
    state: { power: false, brightness: 70 },
  },
];

const rgbToHex = (c: { r: number; g: number; b: number }): string =>
  [c.r, c.g, c.b]
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return { r: 255, g: 255, b: 255 };
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
};

/**
 * Adapter Tasmota — firmware open-source untuk ESP32/ESP8266 (blueprint §8).
 * Kontrol via HTTP API Tasmota: `GET http://<ip>/cm?cmnd=<command>`.
 * Mode `mock` mensimulasikan perangkat in-memory untuk dev tanpa hardware.
 *
 * Perintah:
 *   power       → `Power On/Off`
 *   brightness  → `Dimmer <0-100>`
 *   color       → `Color <RRGGBB>`
 *   temperature → `CT <mireds>` (mireds = 1_000_000 / Kelvin)
 */
export class TasmotaAdapter implements IntegrationAdapter {
  readonly type: IntegrationType = 'TASMOTA';
  readonly vendor = 'tasmota';

  private readonly mode: 'mock' | 'http';
  private readonly mockState = new Map<string, Record<string, unknown>>();

  constructor(config: TasmotaAdapterConfig = {}) {
    // Nilai mode berasal dari env, jadi divalidasi agar salah ketik
    // (mis. "live") tidak membuat adapter diam-diam jadi no-op.
    this.mode = parseMode<TasmotaMode>(
      config.mode,
      TASMOTA_MODES,
      'mock',
      'TASMOTA_MODE',
    );
    if (this.mode === 'mock') this.seedMock();
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    // Tanpa memalsukan hasil: mode http tidak melakukan scanning (perangkat
    // Tasmota ditemukan lewat mDNS oleh DiscoveryService, atau didaftarkan
    // manual), dan mode mock juga tidak mengarang perangkat. Scan kosong
    // lebih jujur daripada menampilkan lampu fiktif.
    return [];
  }

  async getDeviceState(deviceId: string): Promise<Record<string, unknown>> {
    if (this.mode === 'mock') {
      return { ...(this.mockState.get(deviceId) ?? {}) };
    }
    const status = await this.httpRequest(deviceId, 'Status%2011');
    return this.statusToState(status);
  }

  async executeCommand(
    deviceId: string,
    command: IntegrationCommand,
    credentials?: AdapterCredentials,
  ): Promise<Record<string, unknown>> {
    if (this.mode === 'mock') {
      return this.executeMock(deviceId, command);
    }
    await this.httpRequest(
      deviceId,
      encodeURIComponent(this.toCmnd(command)),
      credentials,
    );
    return this.commandToState(command);
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
    const next = this.commandToState(command);
    this.mockState.set(deviceId, { ...current, ...next });
    return { ...current, ...next };
  }

  // ── mode http ───────────────────────────────────────────

  private toCmnd(command: IntegrationCommand): string {
    switch (command.capability) {
      case 'power':
        return command.value ? 'Power On' : 'Power Off';
      case 'brightness':
        return `Dimmer ${command.value}`;
      case 'color': {
        const c = command.value as { r: number; g: number; b: number };
        return `Color ${rgbToHex(c)}`;
      }
      case 'temperature': {
        const kelvin = Number(command.value) || 3000;
        return `CT ${Math.round(1_000_000 / kelvin)}`;
      }
      default:
        return '';
    }
  }

  private commandToState(
    command: IntegrationCommand,
  ): Record<string, unknown> {
    const state: Record<string, unknown> = {};
    switch (command.capability) {
      case 'power':
        state.power = command.value;
        break;
      case 'brightness':
        state.brightness = command.value;
        state.power = (command.value as number) > 0;
        break;
      case 'color':
        state.color = command.value;
        break;
      case 'temperature':
        state.temperature = command.value;
        break;
    }
    return state;
  }

  private statusToState(status: unknown): Record<string, unknown> {
    const raw = (status ?? {}) as Record<string, unknown>;
    const sts = (raw.StatusSTS ?? raw) as Record<string, unknown>;
    const state: Record<string, unknown> = { power: sts.Power === 'ON' };
    if (typeof sts.Dimmer === 'number') state.brightness = sts.Dimmer;
    if (typeof sts.Color === 'string' && sts.Color) {
      state.color = hexToRgb(sts.Color);
    }
    if (typeof sts.CT === 'number' && sts.CT > 0) {
      state.temperature = Math.round(1_000_000 / sts.CT);
    }
    return state;
  }

  private async httpRequest(
    deviceId: string,
    cmnd: string,
    credentials?: AdapterCredentials,
  ): Promise<Record<string, unknown>> {
    const url = `http://${deviceId}/cm?cmnd=${cmnd}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: authHeader(credentials),
    });
    if (!res.ok) {
      throw new Error(`Tasmota HTTP ${res.status} dari ${deviceId}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
}

/**
 * Header Basic Auth dari kredensial integrasi.
 *
 * Tasmota dengan WebPassword aktif menolak request tanpa header ini, jadi
 * kredensial yang disimpan di `Integration.config` harus benar-benar dipakai.
 * Tanpa username, tidak ada header yang dikirim — perangkat tanpa password
 * tetap jalan seperti sebelumnya.
 */
function authHeader(credentials?: AdapterCredentials): Record<string, string> {
  const username = typeof credentials?.username === 'string' ? credentials.username : '';
  const password = typeof credentials?.password === 'string' ? credentials.password : '';
  if (!username) return {};
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
}
