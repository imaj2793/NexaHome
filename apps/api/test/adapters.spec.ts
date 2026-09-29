import { IntegrationCommand, parseMode } from '@nexahome/device-core';
import { WizAdapter } from '@nexahome/integration-wiz';
import { MqttAdapter } from '@nexahome/integration-mqtt';
import { TasmotaAdapter } from '@nexahome/integration-tasmota';

/**
 * Kontrak bersama: aksi Nexa (turn_on/turn_off/...) → IntegrationCommand.
 * Dipakai adapter di bawah hanya menerima capability + value.
 */
const cmd = (capability: string, value: unknown): IntegrationCommand => ({
  capability,
  value,
});

// ── Klien MQTT palsu untuk menguji mode 'mqtt' tanpa broker sungguhan ──
// Catatan: `mqtt` hanya terpasang di packages/integration-mqtt, dan dist-nya
// CommonJS yang di-externalize Vite sehingga vi.mock tidak meng-intercept.
// Karena itu client disuntikkan langsung ke field privat adapter.
type Handler = (...args: never[]) => void;

interface FakeClient {
  connected: boolean;
  on: (event: string, handler: Handler) => FakeClient;
  subscribe: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  /** Trigger event yang didaftarkan adapter, mis. 'message' atau 'connect'. */
  fire: (event: string, ...args: unknown[]) => void;
}

const createFakeClient = (): FakeClient => {
  const listeners: Record<string, Handler> = {};
  const client: FakeClient = {
    connected: true,
    on: (event, handler) => {
      listeners[event] = handler;
      return client;
    },
    subscribe: vi.fn(),
    publish: vi.fn(
      (_topic: string, _payload: string, _opts: unknown, cb?: (e?: Error | null) => void) =>
        cb?.(null),
    ),
    end: vi.fn((_force: boolean, _opts: unknown, cb: () => void) => cb()),
    fire: (event, ...args) =>
      (listeners[event] as ((...a: unknown[]) => void) | undefined)?.(...args),
  };
  return client;
};

/** Adapter mode 'mqtt' yang sudah "terhubung" ke client palsu. */
const mqttAdapterWithFakeClient = (): {
  adapter: MqttAdapter;
  client: FakeClient;
} => {
  const adapter = new MqttAdapter({ mode: 'mqtt', url: 'mqtt://localhost:1883' });
  const client = createFakeClient();
  // Replikasi wiring yang dilakukan connectBroker(): dengarkan event 'message'.
  const onMessage = (adapter as unknown as {
    onMessage: (topic: string, payload: Buffer) => void;
  }).onMessage.bind(adapter);
  client.on('message', ((topic: string, payload: Buffer) =>
    onMessage(topic, payload)) as unknown as Handler);
  (adapter as unknown as { client: FakeClient }).client = client;
  return { adapter, client };
};

describe('WizAdapter (mode mock)', () => {
  let adapter: WizAdapter;

  beforeEach(() => {
    adapter = new WizAdapter({ mode: 'mock' });
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('memiliki type WIZ dan bisa connect/disconnect tanpa error', async () => {
    expect(adapter.type).toBe('WIZ');
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it('menemukan dua lampu mock dengan kapabilitas lengkap', async () => {
    const devices = await adapter.discoverDevices();
    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.id)).toEqual([
      'wiz_aabbccddeeff',
      'wiz_112233445566',
    ]);
    expect(devices[0].name).toBe('WiZ Bulb Ruang Tamu');
    expect(devices[0].type).toBe('light');
    expect(devices[0].capabilities).toEqual([
      'power',
      'brightness',
      'color',
      'temperature',
    ]);
    expect(devices[0].state.power).toBe(true);
  });

  it('mengembalikan state awal lampu dari getDeviceState', async () => {
    const state = await adapter.getDeviceState('wiz_112233445566');
    expect(state).toMatchObject({
      power: false,
      brightness: 40,
      temperature: 2700,
    });
  });

  it('menyalakan lampu lewat perintah power true', async () => {
    const state = await adapter.executeCommand(
      'wiz_112233445566',
      cmd('power', true),
    );
    expect(state.power).toBe(true);
    expect((await adapter.getDeviceState('wiz_112233445566')).power).toBe(true);
  });

  it('mematikan lampu lewat perintah power false', async () => {
    const state = await adapter.executeCommand(
      'wiz_aabbccddeeff',
      cmd('power', false),
    );
    expect(state.power).toBe(false);
    expect((await adapter.getDeviceState('wiz_aabbccddeeff')).power).toBe(false);
  });

  it('mengatur kecerahan dan otomatis menyalakan power', async () => {
    const state = await adapter.executeCommand(
      'wiz_112233445566',
      cmd('brightness', 55),
    );
    expect(state.brightness).toBe(55);
    expect(state.power).toBe(true);
  });

  it('kecerahan 0 ikut mematikan power', async () => {
    const state = await adapter.executeCommand(
      'wiz_aabbccddeeff',
      cmd('brightness', 0),
    );
    expect(state.brightness).toBe(0);
    expect(state.power).toBe(false);
  });

  it('mengatur warna RGB danastore di state internal', async () => {
    const color = { r: 10, g: 20, b: 30 };
    const state = await adapter.executeCommand('wiz_aabbccddeeff', cmd('color', color));
    expect(state.color).toEqual(color);
    expect((await adapter.getDeviceState('wiz_aabbccddeeff')).color).toEqual(color);
  });

  it('mengatur suhu warna', async () => {
    const state = await adapter.executeCommand(
      'wiz_aabbccddeeff',
      cmd('temperature', 4000),
    );
    expect(state.temperature).toBe(4000);
  });

  it('membuat state baru untuk MAC yang tidak dikenal', async () => {
    const state = await adapter.executeCommand('wiz_unknown', cmd('power', true));
    expect(state).toEqual({ power: true, brightness: 0 });
    expect(await adapter.getDeviceState('wiz_unknown')).toEqual({
      power: true,
      brightness: 0,
    });
  });
});

describe('WizAdapter (mode udp)', () => {
  it('tidak membuka socket sampai connect() dipanggil', async () => {
    const adapter = new WizAdapter({ mode: 'udp' });
    expect(adapter.type).toBe('WIZ');
    expect((adapter as unknown as { socket?: unknown }).socket).toBeUndefined();
    await adapter.disconnect();
  });

  it('menolak permintaan state ketika IP perangkat belum diketahui', async () => {
    const adapter = new WizAdapter({ mode: 'udp' });
    await expect(adapter.getDeviceState('aabbccddeeff')).rejects.toThrow(
      /tidak diketahui/,
    );
  });
});

describe('MqttAdapter (mode mock)', () => {
  let adapter: MqttAdapter;

  beforeEach(() => {
    adapter = new MqttAdapter();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('memiliki type MQTT dan connect/disconnect aman tanpa broker', async () => {
    expect(adapter.type).toBe('MQTT');
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it('menemukan sensor mock dengan kapabilitas yang sesuai', async () => {
    const devices = await adapter.discoverDevices();
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      id: 'mqtt_sensor_suhu_01',
      name: 'Sensor Suhu Ruang Tamu',
      type: 'sensor',
    });
    expect(devices[0].capabilities).toEqual(['temperature', 'humidity']);
    expect(devices[1].capabilities).toEqual(['motion']);
  });

  it('mengembalikan state sensor dari getDeviceState', async () => {
    const state = await adapter.getDeviceState('mqtt_sensor_suhu_01');
    expect(state).toEqual({ temperature: 26.5, humidity: 62, online: true });
  });

  it('memperbarui state sensor sesuai perintah', async () => {
    const state = await adapter.executeCommand(
      'mqtt_sensor_suhu_01',
      cmd('temperature', 30),
    );
    expect(state).toEqual({ temperature: 30, humidity: 62, online: true });
    expect((await adapter.getDeviceState('mqtt_sensor_suhu_01')).temperature).toBe(30);
  });

  it('menyetel state perangkat yang belum dikenal', async () => {
    const state = await adapter.executeCommand('mqtt_baru', cmd('motion', true));
    expect(state).toEqual({ motion: true });
  });
});

describe('MqttAdapter (mode mqtt)', () => {
  it('menolak mode mqtt tanpa url broker', () => {
    expect(() => new MqttAdapter({ mode: 'mqtt' })).toThrow(/broker/);
  });

  it('disconnect() menutup koneksi ke broker', async () => {
    const { adapter, client } = mqttAdapterWithFakeClient();
    await adapter.disconnect();
    expect(client.end).toHaveBeenCalled();
  });

  it('getDeviceState subscribe ke topik state perangkat', async () => {
    const { adapter, client } = mqttAdapterWithFakeClient();
    client.fire(
      'message',
      'nexahome/devices/lampu_a/state',
      Buffer.from(JSON.stringify({ power: true })),
    );
    await adapter.getDeviceState('lampu_a');
    expect(client.subscribe).toHaveBeenCalledWith(
      'nexahome/devices/lampu_a/state',
    );
  });

  it('menyimpan state dari topik state dan membacanya kembali', async () => {
    const { adapter, client } = mqttAdapterWithFakeClient();

    client.fire(
      'message',
      'nexahome/devices/lampu_a/state',
      Buffer.from(JSON.stringify({ power: true, brightness: 42 })),
    );

    expect(await adapter.getDeviceState('lampu_a')).toEqual({
      power: true,
      brightness: 42,
    });
  });

  it('mendaftarkan perangkat dari topik discovery', async () => {
    const { adapter, client } = mqttAdapterWithFakeClient();

    client.fire(
      'message',
      'nexahome/discovery',
      Buffer.from(
        JSON.stringify({
          id: 'plug_1',
          name: 'Colok Meja',
          type: 'switch',
          capabilities: ['power'],
          state: { power: false },
        }),
      ),
    );

    expect(await adapter.discoverDevices()).toEqual([
      {
        id: 'plug_1',
        name: 'Colok Meja',
        type: 'switch',
        capabilities: ['power'],
        state: { power: false },
      },
    ]);
  });

  it('menyimpan perangkat otomatis saat state datang dari topik', async () => {
    const { adapter, client } = mqttAdapterWithFakeClient();

    client.fire(
      'message',
      'nexahome/devices/plug_2/state',
      Buffer.from(JSON.stringify({ power: true })),
    );

    expect(await adapter.discoverDevices()).toEqual([
      {
        id: 'plug_2',
        name: 'plug_2',
        type: 'unknown',
        capabilities: [],
        state: { power: true },
      },
    ]);
  });

  it('memperbarui state perangkat yang sudah terdaftar saat state berubah', async () => {
    const { adapter, client } = mqttAdapterWithFakeClient();

    client.fire(
      'message',
      'nexahome/devices/plug_2/state',
      Buffer.from(JSON.stringify({ power: true })),
    );
    client.fire(
      'message',
      'nexahome/devices/plug_2/state',
      Buffer.from(JSON.stringify({ power: false, brightness: 5 })),
    );

    const [device] = await adapter.discoverDevices();
    expect(device!.state).toEqual({ power: false, brightness: 5 });
  });

  it('executeCommand mengirim publish ke topik set dan menggabungkan state', async () => {
    const { adapter, client } = mqttAdapterWithFakeClient();
    client.fire(
      'message',
      'nexahome/devices/lampu_a/state',
      Buffer.from(JSON.stringify({ power: false, brightness: 10 })),
    );

    const state = await adapter.executeCommand('lampu_a', cmd('brightness', 90));
    expect(client.publish).toHaveBeenCalledWith(
      'nexahome/devices/lampu_a/set',
      JSON.stringify({ capability: 'brightness', value: 90 }),
      {},
      expect.any(Function),
    );
    expect(state).toEqual({ power: false, brightness: 90 });
  });

  it('menolak perintah saat belum terhubung', async () => {
    const adapter = new MqttAdapter({
      mode: 'mqtt',
      url: 'mqtt://localhost:1883',
    });
    await expect(
      adapter.executeCommand('lampu_a', cmd('power', true)),
    ).rejects.toThrow(/belum terhubung/);
  });
});

describe('TasmotaAdapter (mode mock)', () => {
  let adapter: TasmotaAdapter;

  beforeEach(() => {
    adapter = new TasmotaAdapter();
  });

  it('memiliki type TASMOTA dan vendor tasmota', () => {
    expect(adapter.type).toBe('TASMOTA');
    expect(adapter.vendor).toBe('tasmota');
  });

  it('connect/disconnect adalah no-op yang aman', async () => {
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it('menumerate relay dan dimmer mock', async () => {
    const devices = await adapter.discoverDevices();
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      id: 'tasmota_relay_01',
      name: 'Tasmota Relay',
      type: 'switch',
      vendor: 'tasmota',
    });
    expect(devices[0].capabilities).toEqual(['power']);
    expect(devices[1].capabilities).toEqual(['power', 'brightness']);
  });

  it('getDeviceState mengembalikan state relay', async () => {
    expect(await adapter.getDeviceState('tasmota_relay_01')).toEqual({
      power: false,
    });
  });

  it('menyalakan relay', async () => {
    const state = await adapter.executeCommand(
      'tasmota_relay_01',
      cmd('power', true),
    );
    expect(state).toEqual({ power: true });
  });

  it('mematikan relay', async () => {
    await adapter.executeCommand('tasmota_relay_01', cmd('power', true));
    const state = await adapter.executeCommand(
      'tasmota_relay_01',
      cmd('power', false),
    );
    expect(state).toEqual({ power: false });
  });

  it('mengatur kecerahan dimmer dan ikut menyalakan power', async () => {
    const state = await adapter.executeCommand(
      'tasmota_dimmer_01',
      cmd('brightness', 35),
    );
    expect(state).toEqual({ power: true, brightness: 35 });
  });

  it('menyimpan warna pada state perangkat', async () => {
    const color = { r: 255, g: 0, b: 128 };
    const state = await adapter.executeCommand('tasmota_relay_01', cmd('color', color));
    expect(state.color).toEqual(color);
    expect((await adapter.getDeviceState('tasmota_relay_01')).color).toEqual(color);
  });
});

describe('TasmotaAdapter (mode http)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const okResponse = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;

  it('discovery nyata dikosongkan (ditangani DiscoveryService via mDNS)', async () => {
    const adapter = new TasmotaAdapter({ mode: 'http' });
    expect(await adapter.discoverDevices()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getDeviceState memetakan Status 11 ke state NexaHome', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        StatusSTS: {
          Power: 'ON',
          Dimmer: 80,
          Color: 'FF8000',
          CT: 250,
        },
      }),
    );
    const adapter = new TasmotaAdapter({ mode: 'http' });
    const state = await adapter.getDeviceState('192.168.1.50');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50/cm?cmnd=Status%2011',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(state).toEqual({
      power: true,
      brightness: 80,
      color: { r: 255, g: 128, b: 0 },
      temperature: 4000,
    });
  });

  it('executeCommand power mengirim "Power On" via HTTP', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    const adapter = new TasmotaAdapter({ mode: 'http' });
    const state = await adapter.executeCommand('192.168.1.50', cmd('power', true));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50/cm?cmnd=Power%20On',
      expect.anything(),
    );
    expect(state).toEqual({ power: true });
  });

  it('executeCommand brightness mengirim "Dimmer <n>"', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    const adapter = new TasmotaAdapter({ mode: 'http' });
    const state = await adapter.executeCommand('192.168.1.50', cmd('brightness', 60));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50/cm?cmnd=Dimmer%2060',
      expect.anything(),
    );
    expect(state).toEqual({ brightness: 60, power: true });
  });

  it('executeCommand color mengonversi RGB ke hex Tasmota', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    const adapter = new TasmotaAdapter({ mode: 'http' });
    await adapter.executeCommand(
      '192.168.1.50',
      cmd('color', { r: 255, g: 128, b: 0 }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50/cm?cmnd=Color%20FF8000',
      expect.anything(),
    );
  });

  it('executeCommand temperature mengonversi Kelvin ke mireds', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    const adapter = new TasmotaAdapter({ mode: 'http' });
    await adapter.executeCommand('192.168.1.50', cmd('temperature', 4000));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50/cm?cmnd=CT%20250',
      expect.anything(),
    );
  });

  it('melempar error saat Tasmota merespons non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as Response);
    const adapter = new TasmotaAdapter({ mode: 'http' });
    await expect(adapter.getDeviceState('192.168.1.50')).rejects.toThrow(
      /Tasmota HTTP 502/,
    );
  });
});

// ── Validasi mode dari environment ──────────────────────────────────────────
// Mode dibaca dari env lalu diteruskan apa adanya ke adapter. Nilai yang tidak
// dikenal harus menggagalkan startup, bukan diam-diam jadi no-op.
describe('validasi mode integrasi', () => {
  it('menolak MQTT_MODE yang tidak dikenal', () => {
    expect(
      () => new MqttAdapter({ mode: 'live' as 'mqtt', url: 'mqtt://localhost:1883' }),
    ).toThrow(/MQTT_MODE="live" tidak dikenal/);
  });

  it('menolak TASMOTA_MODE yang tidak dikenal', () => {
    expect(() => new TasmotaAdapter({ mode: 'live' as 'http' })).toThrow(
      /TASMOTA_MODE="live" tidak dikenal/,
    );
  });

  it('menolak WIZ_MODE yang tidak dikenal', () => {
    expect(() => new WizAdapter({ mode: 'live' as 'udp' })).toThrow(
      /WIZ_MODE="live" tidak dikenal/,
    );
  });

  it('menyebutkan semua mode yang didukung', () => {
    expect(() => new MqttAdapter({ mode: 'live' as 'mqtt' })).toThrow(
      /"mock", "mqtt"/,
    );
  });

  it('memakai mode mock saat env kosong', () => {
    const adapter = new MqttAdapter({ mode: undefined });
    expect(adapter.type).toBe('MQTT');
  });
});

describe('parseMode', () => {
  const allowed = ['mock', 'mqtt'] as const;

  it('mengembalikan fallback untuk undefined', () => {
    expect(parseMode(undefined, allowed, 'mock', 'MQTT_MODE')).toBe('mock');
  });

  it('mengembalikan fallback untuk string kosong', () => {
    expect(parseMode('   ', allowed, 'mock', 'MQTT_MODE')).toBe('mock');
  });

  it('memangkas spasi di sekitar nilai', () => {
    expect(parseMode(' mqtt ', allowed, 'mock', 'MQTT_MODE')).toBe('mqtt');
  });

  it('melempar error berisi nama env untuk nilai asing', () => {
    expect(() => parseMode('live', allowed, 'mock', 'MQTT_MODE')).toThrow(
      /MQTT_MODE="live" tidak dikenal\. Nilai yang didukung: "mock", "mqtt"\./,
    );
  });
});
