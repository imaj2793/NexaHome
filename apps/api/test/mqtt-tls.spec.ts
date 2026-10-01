import { createRequire } from 'node:module';

/**
 * Opsi TLS untuk broker harus benar-benar sampai ke mqtt.js, dan hanya pada
 * URL yang memang terenkripsi.
 *
 * Dua kesalahan yang paling mahal dan paling tidak terlihat:
 *   1. `ca` ikut ke koneksi `mqtt://` — tidak merusak apa pun, tapi membuat
 *      log debugging menyesatkan ("kenapa ada CA di koneksi biasa?").
 *   2. Kredensial integrasi yang kosong ditafsirkan "tanpa kredensial",
 *      bukan "pakai yang global" — broker ber-password menolak dengan
 *      "not authorised" yang tidak pernah sampai ke log API.
 *
 * `mqtt` dimock lewat jalur absolut (lihat MQTT_PATH) karena paket workspace
 * me-resolve dependensinya dari node_modules-nya sendiri.
 */

const MQTT_PATH = createRequire(import.meta.url).resolve('mqtt', {
  paths: ['../../packages/integration-mqtt'],
});

const connect = vi.fn();
const publish = vi.fn();
const end = vi.fn();

function fakeClient() {
  const handlers = new Map<string, ((...args: never[]) => void)[]>();
  const add = (event: string, handler: (...args: never[]) => void) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    if (event === 'connect') queueMicrotask(() => handler(undefined as never));
    return client;
  };

  const client = {
    connected: true,
    on: vi.fn(add),
    once: vi.fn(add),
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

async function loadMqttAdapter() {
  vi.resetModules();
  vi.doMock(MQTT_PATH, () => ({
    default: { connect: (...args: unknown[]) => connect(...args) },
  }));
  const mod = await import('@nexahome/integration-mqtt');
  return mod.MqttAdapter;
}

type MqttAdapterType = InstanceType<Awaited<ReturnType<typeof loadMqttAdapter>>>;

const CA = '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----';

const buildSecure = async (
  overrides: Record<string, unknown> = {},
): Promise<MqttAdapterType> => {
  const MqttAdapter = await loadMqttAdapter();
  return new MqttAdapter({
    mode: 'mqtt',
    url: 'mqtts://mqtt:8883',
    username: 'nexahome',
    password: 'pw-utama',
    tlsRejectUnauthorized: true,
    tlsCa: CA,
    ...overrides,
  });
};

describe('MqttAdapter — opsi TLS', () => {
  it('meneruskan CA dan verifikasi ke koneksi mqtts', async () => {
    const adapter = await buildSecure();
    await adapter.connect();

    expect(connect).toHaveBeenCalledWith('mqtts://mqtt:8883', {
      username: 'nexahome',
      password: 'pw-utama',
      rejectUnauthorized: true,
      ca: CA,
    });
  });

  it('meneruskan sertifikat klien dan kunci untuk mTLS', async () => {
    const adapter = await buildSecure({ tlsCert: 'cert-pem', tlsKey: 'key-pem' });
    await adapter.connect();

    expect(connect).toHaveBeenCalledWith(
      'mqtts://mqtt:8883',
      expect.objectContaining({ cert: 'cert-pem', key: 'key-pem' }),
    );
  });

  it('wss:// memakai opsi TLS yang sama', async () => {
    const adapter = await buildSecure({ url: 'wss://localhost:443' });
    await adapter.connect();

    expect(connect).toHaveBeenCalledWith(
      'wss://localhost:443',
      expect.objectContaining({ ca: CA, rejectUnauthorized: true }),
    );
  });

  it('tidak mengirim opsi TLS ke koneksi mqtt:// biasa', async () => {
    const adapter = await buildSecure({ url: 'mqtt://mqtt:1883' });
    await adapter.connect();

    expect(connect).toHaveBeenCalledWith('mqtt://mqtt:1883', {
      username: 'nexahome',
      password: 'pw-utama',
    });
  });

  it('menolak verifikasi dimatikan pada URL plaintext', async () => {
    const MqttAdapter = await loadMqttAdapter();
    expect(
      () =>
        new MqttAdapter({
          mode: 'mqtt',
          url: 'mqtt://mqtt:1883',
          tlsRejectUnauthorized: false,
        }),
    ).toThrow(/hanya boleh dipakai pada URL ber-TLS/);
  });

  it('koneksi sekali pakai ke broker TLS juga memakai CA dan kredensial', async () => {
    const adapter = await buildSecure();
    await adapter.connect();

    await adapter.executeCommand('dev_1', { capability: 'power', value: true }, {
      brokerUrl: 'mqtts://broker-kedua:8883',
      username: 'user2',
      password: 'pw-2',
    });

    expect(connect).toHaveBeenLastCalledWith('mqtts://broker-kedua:8883', {
      username: 'user2',
      password: 'pw-2',
      rejectUnauthorized: true,
      ca: CA,
    });
    expect(end).toHaveBeenCalled();
  });

  it('kredensial kosong berarti pakai kredensial global, bukan tanpa kredensial', async () => {
    const adapter = await buildSecure();
    await adapter.connect();
    const callsAfterConnect = connect.mock.calls.length;

    // Integrasi tanpa config broker: `resolveTarget` harus memakai koneksi primary.
    await adapter.executeCommand('dev_1', { capability: 'power', value: true }, {});

    expect(connect.mock.calls.length).toBe(callsAfterConnect);
  });

  it('broker lain tanpa kredensial tidak menerima kredensial global', async () => {
    const adapter = await buildSecure();
    await adapter.connect();

    await adapter.executeCommand('dev_1', { capability: 'power', value: true }, {
      brokerUrl: 'mqtts://broker-kedua:8883',
    });

    // Password broker kita tidak boleh dikirim ke host yang bukan milik kita.
    expect(connect).toHaveBeenLastCalledWith('mqtts://broker-kedua:8883', {
      rejectUnauthorized: true,
      ca: CA,
    });
  });

  it('URL integrasi sama dengan URL global tapi tanpa kredensial tetap memakai primary', async () => {
    const adapter = await buildSecure();
    await adapter.connect();
    const callsAfterConnect = connect.mock.calls.length;

    await adapter.executeCommand(
      'dev_1',
      { capability: 'power', value: true },
      { brokerUrl: 'mqtts://mqtt:8883' },
    );

    // Kalau ini salah, koneksi sekali pakai terbuka tanpa username dan
    // broker menolak dengan "not authorised".
    expect(connect.mock.calls.length).toBe(callsAfterConnect);
  });
});