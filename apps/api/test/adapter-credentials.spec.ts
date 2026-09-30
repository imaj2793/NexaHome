import { createRequire } from 'node:module';
import type { TasmotaAdapter as TasmotaAdapterType } from '@nexahome/integration-tasmota';

/**
 * Kredensial per integrasi harus benar-benar dipakai adapter — kalau tidak,
 * enkripsi di DB cuma brankas yang tidak pernah dibuka.
 *
 * `mode: 'mqtt'` / `'http'` dipakai dengan jaringan dipalsukan: tidak ada
 * koneksi keluar ke broker atau perangkat sungguhan.
 */

const MQTT_PATH = createRequire(import.meta.url).resolve('mqtt', {
  paths: ['../../packages/integration-mqtt'],
});

const connect = vi.fn();
const publish = vi.fn();
const end = vi.fn();

/** Client tiruan dengan bentuk seragam untuk semua koneksi. */
function fakeClient() {
  const handlers = new Map<string, ((...args: never[]) => void)[]>();
  const add = (event: string, handler: (...args: never[]) => void) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    if (event === 'connect') queueMicrotask(() => handler(undefined as never));
    return client;
  };

  const client = {
    // `ensureConnected()` memeriksa flag ini, bukan hanya keberadaan client.
    connected: true,
    on: vi.fn(add),
    once: vi.fn(add),
    /** Menjalankan handler yang benar-benar terdaftar, seperti EventEmitter. */
    emit: vi.fn((event: string, ...args: never[]) => {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    }),
    off: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== handler));
    }),
    subscribe: vi.fn((_topic: string, cb?: (e?: Error | null) => void) => cb?.(null)),
    publish,
    end,
  };
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  connect.mockImplementation(() => fakeClient());
  publish.mockImplementation(
    (_topic: string, _payload: string, _opts: unknown, cb: (e?: Error) => void) =>
      cb(),
  );
  end.mockImplementation((_force: boolean, _opts: unknown, cb: () => void) => cb());
});

/**
 * Adapter diambil setelah `doMock`, karena paket workspace me-resolve `mqtt`
 * dari node_modules-nya sendiri sehingga mock di sisi app tidak mengenainya.
 */
async function loadMqttAdapter() {
  vi.resetModules();
  vi.doMock(MQTT_PATH, () => ({
    default: { connect: (...args: unknown[]) => connect(...args) },
  }));
  const mod = await import('@nexahome/integration-mqtt');
  return mod.MqttAdapter;
}

type MqttAdapterType = InstanceType<Awaited<ReturnType<typeof loadMqttAdapter>>>;

const buildMqtt = async (): Promise<MqttAdapterType> => {
  const MqttAdapter = await loadMqttAdapter();
  return new MqttAdapter({
    mode: 'mqtt',
    url: 'mqtt://broker-utama:1883',
    username: 'utama',
    password: 'pw-utama',
  });
};

describe('MqttAdapter — kredensial integrasi', () => {
  it('tanpa kredensial memakai koneksi utama yang sudah ada', async () => {
    const adapter = await buildMqtt();
    await adapter.connect();
    const callsAfterConnect = connect.mock.calls.length;

    await adapter.executeCommand('dev_1', { capability: 'power', value: true });

    // Tidak ada koneksi tambahan yang dibuat untuk satu perintah.
    expect(connect.mock.calls.length).toBe(callsAfterConnect);
    expect(publish).toHaveBeenCalledWith(
      'nexahome/devices/dev_1/set',
      JSON.stringify({ capability: 'power', value: true }),
      { qos: 0 },
      expect.any(Function),
    );
  });

  it('kredensial untuk broker yang sama tetap memakai koneksi utama', async () => {
    const adapter = await buildMqtt();
    await adapter.connect();
    const callsAfterConnect = connect.mock.calls.length;

    await adapter.executeCommand(
      'dev_1',
      { capability: 'power', value: true },
      {
        brokerUrl: 'mqtt://broker-utama:1883',
        username: 'utama',
        password: 'pw-utama',
      },
    );

    expect(connect.mock.calls.length).toBe(callsAfterConnect);
  });

  it('kredensial broker lain memakai koneksi sekali pakai, lalu menutupnya', async () => {
    const adapter = await buildMqtt();
    await adapter.connect();
    const callsAfterConnect = connect.mock.calls.length;

    await adapter.executeCommand(
      'dev_1',
      { capability: 'brightness', value: 40 },
      {
        brokerUrl: 'mqtt://broker-kedua:1883',
        username: 'user2',
        password: 'pw-2',
      },
    );

    expect(connect.mock.calls.length).toBe(callsAfterConnect + 1);
    expect(connect).toHaveBeenLastCalledWith('mqtt://broker-kedua:1883', {
      username: 'user2',
      password: 'pw-2',
    });
    expect(publish).toHaveBeenCalledWith(
      'nexahome/devices/dev_1/set',
      JSON.stringify({ capability: 'brightness', value: 40 }),
      { qos: 0 },
      expect.any(Function),
    );
    // Koneksi sekali pakai harus ditutup, kalau tidak menumpuk tiap perintah.
    expect(end).toHaveBeenCalled();
  });

  it('kredensial tanpa username tidak mengirim username kosong ke broker', async () => {
    const adapter = await buildMqtt();
    await adapter.connect();

    await adapter.executeCommand(
      'dev_1',
      { capability: 'power', value: true },
      { brokerUrl: 'mqtt://broker-kedua:1883' },
    );

    // `{}` — bukan `{ username: '', password: '' }` yang ditolak broker.
    expect(connect).toHaveBeenLastCalledWith('mqtt://broker-kedua:1883', {});
  });

  it('koneksi yang gagal di broker lain tidak menggantung', async () => {
    const adapter = await buildMqtt();
    await adapter.connect();
    connect.mockImplementationOnce(() => {
      throw new Error('ECONNREFUSED');
    });

    await expect(
      adapter.executeCommand(
        'dev_1',
        { capability: 'power', value: true },
        { brokerUrl: 'mqtt://broker-mati:1883' },
      ),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('getDeviceState membaca state dari broker milik integrasi', async () => {
    const adapter = await buildMqtt();
    await adapter.connect();
    connect.mockImplementationOnce(() => {
      const client = fakeClient();
      // Broker membalas state setelah subscription, seperti perangkat nyata.
      setImmediate(() =>
        client.emit('message', 'nexahome/devices/dev_9/state', Buffer.from('{"power":true}')),
      );
      return client;
    });

    const state = await adapter.getDeviceState('dev_9', {
      brokerUrl: 'mqtt://broker-kedua:1883',
      username: 'user2',
      password: 'pw-2',
    });

    expect(state).toEqual({ power: true });
    expect(end).toHaveBeenCalled();
  });

  it('getDeviceState mengabaikan state dari topik lain', async () => {
    const adapter = await buildMqtt();
    await adapter.connect();
    connect.mockImplementationOnce(() => {
      const client = fakeClient();
      setImmediate(() => {
        client.emit(
          'message',
          'nexahome/devices/dev_lain/state',
          Buffer.from('{"power":false}'),
        );
        client.emit(
          'message',
          'nexahome/devices/dev_9/state',
          Buffer.from('{"power":true,"brightness":70}'),
        );
      });
      return client;
    });

    await expect(
      adapter.getDeviceState('dev_9', { brokerUrl: 'mqtt://broker-kedua:1883' }),
    ).resolves.toEqual({ power: true, brightness: 70 });
  });

  it('discoverDevices mendengarkan pengumuman di broker integrasi', async () => {
    const MqttAdapter = await loadMqttAdapter();
    const adapter = new MqttAdapter({
      mode: 'mqtt',
      url: 'mqtt://broker-utama:1883',
      discoveryWindowMs: 50,
    });
    await adapter.connect();
    connect.mockImplementationOnce(() => {
      const client = fakeClient();
      setImmediate(() =>
        client.emit(
          'message',
          'nexahome/discovery',
          Buffer.from(
            JSON.stringify({
              id: 'dev_baru',
              name: 'Kipas',
              type: 'fan',
              capabilities: ['power', 'speed'],
              state: { power: false },
            }),
          ),
        ),
      );
      return client;
    });

    await expect(
      adapter.discoverDevices({ brokerUrl: 'mqtt://broker-kedua:1883' }),
    ).resolves.toEqual([
      {
        id: 'dev_baru',
        name: 'Kipas',
        type: 'fan',
        capabilities: ['power', 'speed'],
        state: { power: false },
      },
    ]);
    expect(end).toHaveBeenCalled();
  });

  it('discoverDevices tidak membocorkan cache broker utama ke integrasi lain', async () => {
    const MqttAdapter = await loadMqttAdapter();
    const adapter = new MqttAdapter({
      mode: 'mqtt',
      url: 'mqtt://broker-utama:1883',
      discoveryWindowMs: 50,
    });
    // Perangkat milik broker utama, yang sudah diketahui adapter.
    const internals = adapter as unknown as {
      discovered: Map<string, unknown>;
      lastSeen: Map<string, number>;
    };
    internals.discovered.set('dev_utama', { id: 'dev_utama', name: 'Utama' });
    internals.lastSeen.set('dev_utama', Date.now());
    await adapter.connect();
    connect.mockImplementationOnce(() => fakeClient());

    // Scan untuk broker kedua yang tidak mengsiilkan apa pun.
    const found = await adapter.discoverDevices({
      brokerUrl: 'mqtt://broker-kedua:1883',
    });

    expect(found).toEqual([]);
    // Scan ke broker utama tetap melihat perangkatnya sendiri.
    await expect(adapter.discoverDevices()).resolves.toHaveLength(1);
  });

  it('discoverDevices mengabaikan pengumuman rusak tanpa menggagalkan scan', async () => {
    const MqttAdapter = await loadMqttAdapter();
    const adapter = new MqttAdapter({
      mode: 'mqtt',
      url: 'mqtt://broker-utama:1883',
      discoveryWindowMs: 50,
    });
    await adapter.connect();
    connect.mockImplementationOnce(() => {
      const client = fakeClient();
      setImmediate(() => {
        client.emit('message', 'nexahome/discovery', Buffer.from('{bukan json'));
        client.emit(
          'message',
          'nexahome/discovery',
          Buffer.from(JSON.stringify({ name: 'tanpa id' })),
        );
        client.emit(
          'message',
          'nexahome/discovery',
          Buffer.from(JSON.stringify({ id: 'dev_oke' })),
        );
      });
      return client;
    });

    const found = await adapter.discoverDevices({
      brokerUrl: 'mqtt://broker-kedua:1883',
    });
    expect(found.map((d) => d.id)).toEqual(['dev_oke']);
  });
});

describe('TasmotaAdapter — kredensial integrasi', () => {
  const fetchMock = vi.fn();
  let adapter: TasmotaAdapterType;

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ POWER: 'ON' }) });
    const { TasmotaAdapter } = await import('@nexahome/integration-tasmota');
    adapter = new TasmotaAdapter({ mode: 'http' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mengirim Basic Auth dari kredensial integrasi', async () => {
    await adapter.executeCommand(
      'tasmota-01.local',
      { capability: 'power', value: true },
      { username: 'admin', password: 'rahasia' },
    );

    const expected = Buffer.from('admin:rahasia').toString('base64');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual({ Authorization: `Basic ${expected}` });
  });

  it('tanpa kredensial tidak mengirim header sama sekali', async () => {
    await adapter.executeCommand('tasmota-01.local', {
      capability: 'power',
      value: true,
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual({});
  });

  it('kredensial tanpa username tidak mengirim header kosong', async () => {
    await adapter.executeCommand(
      'tasmota-01.local',
      { capability: 'power', value: true },
      { password: 'tanpa-username' },
    );

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual({});
  });

  it('password Tasmota tidak bocor lewat pesan error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    const error = await adapter
      .executeCommand(
        'tasmota-01.local',
        { capability: 'power', value: true },
        { username: 'admin', password: 'rahasia' },
      )
      .catch((e: Error) => e);

    expect((error as Error).message).not.toContain('rahasia');
    expect((error as Error).message).toContain('401');
  });
});
