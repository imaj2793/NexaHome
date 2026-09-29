import { createSocket, RemoteInfo, Socket } from 'dgram';
import {
  DiscoveredDevice,
  IntegrationAdapter,
  IntegrationCommand,
  IntegrationType,
  parseMode,
} from '@nexahome/device-core';

const WIZ_PORT = 38899;

/** Mode yang didukung adapter WiZ. */
type WizMode = 'mock' | 'udp';

const WIZ_MODES: readonly WizMode[] = ['mock', 'udp'];

export interface WizAdapterConfig {
  /** 'mock' = simulasi in-memory (dev tanpa bulb fisik); 'udp' = protokol asli. */
  mode: WizMode;
  broadcastAddress?: string;
  port?: number;
}

interface MockBulbSeed {
  id: string;
  name: string;
  state: Record<string, unknown>;
}

const DEFAULT_MOCK_BULBS: MockBulbSeed[] = [
  {
    id: 'wiz_aabbccddeeff',
    name: 'WiZ Bulb Ruang Tamu',
    state: {
      power: true,
      brightness: 80,
      color: { r: 255, g: 255, b: 255 },
      temperature: 3000,
    },
  },
  {
    id: 'wiz_112233445566',
    name: 'WiZ Bulb Kamar',
    state: {
      power: false,
      brightness: 40,
      color: { r: 255, g: 200, b: 100 },
      temperature: 2700,
    },
  },
];

interface PilotParams {
  method: string;
  params?: unknown;
}

/**
 * Adapter WiZ (blueprint §9). Berkomunikasi via UDP port 38899 (getPilot /
 * setPilot / registration). Dalam mode `mock`, mensimulasikan bulb in-memory.
 */
export class WizAdapter implements IntegrationAdapter {
  readonly type: IntegrationType = 'WIZ';

  private readonly config: Required<WizAdapterConfig>;
  private socket?: Socket;
  private readonly mockState = new Map<string, Record<string, unknown>>();
  private readonly ipByMac = new Map<string, string>();

  constructor(config: WizAdapterConfig = { mode: 'mock' }) {
    // Nilai mode berasal dari env, jadi divalidasi agar salah ketik
    // (mis. "live") tidak membuat adapter diam-diam jadi no-op.
    this.config = {
      mode: parseMode<WizMode>(config.mode, WIZ_MODES, 'mock', 'WIZ_MODE'),
      broadcastAddress: config.broadcastAddress ?? '255.255.255.255',
      port: config.port ?? WIZ_PORT,
    };
    if (this.config.mode === 'mock') this.seedMock();
  }

  private seedMock(): void {
    for (const b of DEFAULT_MOCK_BULBS) {
      this.mockState.set(b.id, { ...b.state });
    }
  }

  async connect(): Promise<void> {
    if (this.config.mode !== 'udp') return;
    this.socket = createSocket('udp4');
    await new Promise<void>((resolve, reject) => {
      this.socket!.on('error', reject);
      this.socket!.bind(this.config.port, () => resolve());
    });
    await this.discoverUdp();
  }

  async disconnect(): Promise<void> {
    this.socket?.close();
    this.socket = undefined;
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    if (this.config.mode === 'mock') {
      return [...this.mockState.entries()].map(([id, state]) => ({
        id,
        name: this.mockName(id),
        type: 'light',
        capabilities: ['power', 'brightness', 'color', 'temperature'],
        state: { ...state },
      }));
    }
    return this.discoverUdp();
  }

  async getDeviceState(deviceId: string): Promise<Record<string, unknown>> {
    if (this.config.mode === 'mock') {
      return { ...(this.mockState.get(deviceId) ?? {}) };
    }
    return this.getPilot(deviceId);
  }

  async executeCommand(
    deviceId: string,
    command: IntegrationCommand,
  ): Promise<Record<string, unknown>> {
    if (this.config.mode === 'mock') {
      return this.executeMock(deviceId, command);
    }
    return this.setPilot(deviceId, command);
  }

  // ── mode mock ──────────────────────────────────────────

  private mockName(id: string): string {
    return (
      DEFAULT_MOCK_BULBS.find((b) => b.id === id)?.name ?? `WiZ Bulb ${id}`
    );
  }

  private executeMock(
    deviceId: string,
    command: IntegrationCommand,
  ): Record<string, unknown> {
    const current = this.mockState.get(deviceId) ?? {
      power: false,
      brightness: 0,
    };
    const next: Record<string, unknown> = { ...current };

    switch (command.capability) {
      case 'power':
        next.power = command.value;
        break;
      case 'brightness':
        next.brightness = command.value;
        next.power = (command.value as number) > 0;
        break;
      case 'color':
        next.color = command.value;
        break;
      case 'temperature':
        next.temperature = command.value;
        break;
    }

    this.mockState.set(deviceId, next);
    return { ...next };
  }

  // ── mode udp (protokol WiZ asli) ───────────────────────

  private async discoverUdp(): Promise<DiscoveredDevice[]> {
    const macs = await this.broadcastRegistration();
    const devices: DiscoveredDevice[] = [];
    for (const mac of macs) {
      const state = await this.getPilot(mac).catch(() => ({}));
      devices.push({
        id: mac,
        name: `WiZ ${mac.slice(-6).toUpperCase()}`,
        type: 'light',
        capabilities: ['power', 'brightness', 'color', 'temperature'],
        state,
      });
    }
    return devices;
  }

  private broadcastRegistration(): Promise<string[]> {
    return new Promise((resolve) => {
      const macs = new Set<string>();
      const msg = JSON.stringify({
        method: 'registration',
        params: {
          phoneMac: 'AAAAAAAAAAAA',
          register: false,
          phoneIp: '1.2.3.4',
          id: '1',
        },
      });

      const onMessage = (buf: Buffer, rinfo: RemoteInfo) => {
        try {
          const data = JSON.parse(buf.toString());
          const mac: string | undefined = data?.result?.mac;
          if (mac) {
            macs.add(mac);
            this.ipByMac.set(mac, rinfo.address);
          }
        } catch {
          /* abaikan paket non-JSON */
        }
      };

      this.socket!.on('message', onMessage);
      this.socket!.setBroadcast(true);
      this.socket!.send(
        msg,
        0,
        msg.length,
        this.config.port,
        this.config.broadcastAddress,
      );
      setTimeout(() => {
        this.socket?.removeListener('message', onMessage);
        resolve([...macs]);
      }, 2500);
    });
  }

  private getPilot(mac: string): Promise<Record<string, unknown>> {
    return this.udpRequest(mac, { method: 'getPilot' });
  }

  private async setPilot(
    mac: string,
    command: IntegrationCommand,
  ): Promise<Record<string, unknown>> {
    const current = await this.getPilot(mac).catch(() => ({}));
    const params = this.toPilotParams(current, command);
    await this.udpRequest(mac, { method: 'setPilot', params });
    return { ...current, ...this.paramsToState(params) };
  }

  private toPilotParams(
    current: Record<string, unknown>,
    command: IntegrationCommand,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {
      state: current.state ?? true,
      dimming: current.dimming ?? 100,
    };

    switch (command.capability) {
      case 'power':
        params.state = command.value;
        break;
      case 'brightness':
        params.dimming = command.value;
        params.state = (command.value as number) > 0;
        break;
      case 'color': {
        const c = command.value as { r: number; g: number; b: number };
        params.r = c.r;
        params.g = c.g;
        params.b = c.b;
        break;
      }
      case 'temperature':
        params.temp = command.value;
        break;
    }

    return params;
  }

  private paramsToState(
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      power: params.state === true,
      brightness: params.dimming,
      ...(params.r !== undefined
        ? { color: { r: params.r, g: params.g, b: params.b } }
        : {}),
      ...(params.temp !== undefined ? { temperature: params.temp } : {}),
    };
  }

  private udpRequest(
    mac: string,
    payload: PilotParams,
  ): Promise<Record<string, unknown>> {
    const ip = this.ipByMac.get(mac);
    if (!ip) {
      return Promise.reject(
        new Error(
          `Alamat IP perangkat "${mac}" tidak diketahui — jalankan discover dahulu.`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const msg = JSON.stringify(payload);
      const onMessage = (buf: Buffer) => {
        try {
          const data = JSON.parse(buf.toString());
          if (data?.method === payload.method) {
            this.socket?.removeListener('message', onMessage);
            resolve(data?.result ?? {});
          }
        } catch {
          /* abaikan */
        }
      };

      this.socket!.on('message', onMessage);
      this.socket!.send(msg, 0, msg.length, this.config.port, ip, (err) => {
        if (err) reject(err);
      });
      setTimeout(() => {
        this.socket?.removeListener('message', onMessage);
        reject(new Error(`Timeout menunggu respons dari ${mac}`));
      }, 2000);
    });
  }
}
