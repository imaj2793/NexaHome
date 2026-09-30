import { DeviceGateway } from './device.gateway';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { Socket } from 'socket.io';

/**
 * Test gateway secara manual (tanpa server socket.io sungguhan).
 *
 * Fokusnya dua hal yang mahal kalau rusak:
 *  1. Otorisasi — event hanya boleh masuk room rumah yang Accessible.
 *  2. Pendaftaran listener `home:join` yang harus sinkron, bukan setelah await.
 */

interface FakeClientOptions {
  token?: string;
}

/** Socket tiruan yang mencatat emit dan room yang di-join. */
function fakeClient({ token }: FakeClientOptions = {}) {
  const listeners = new Map<string, (payload?: unknown) => void>();
  const emitted: { event: string; payload?: unknown }[] = [];
  const joined: string[] = [];
  let disconnected = false;

  const client = {
    handshake: {
      auth: token !== undefined ? { token } : {},
      query: {},
      headers: {},
    },
    data: {} as Record<string, unknown>,
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      // Mimik socket.io: satu handler per event per socket.
      listeners.set(event, handler);
      return client;
    }),
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
      return true;
    }),
    join: vi.fn(async (room: string) => {
      joined.push(room);
      return client;
    }),
    disconnect: vi.fn(() => {
      disconnected = true;
      return client;
    }),
  } as unknown as Socket;

  return {
    client,
    emitted,
    joined,
    /** Apakah koneksi ditutup paksa? */
    isDisconnected: () => disconnected,
    /** Picu handler `home:join` seperti client sungguhan. */
    send: async (event: string, payload?: unknown) => {
      const handler = listeners.get(event);
      if (!handler) return undefined;
      return await handler(payload);
    },
    /** Apakah handler sudah terdaftar pada event tertentu? */
    hasListener: (event: string) => listeners.has(event),
    emittedOf: (event: string) => emitted.filter((e) => e.event === event),
  };
}

function buildGateway(options: {
  verify?: (token: string) => Promise<{ sub: string }>;
  userExists?: boolean;
  memberOf?: (homeId: string) => boolean;
  ownedCount?: (homeId: string) => number;
} = {}) {
  const {
    verify = async (_token: string) => ({ sub: 'usr_1' }),
    userExists = true,
    memberOf = () => false,
    ownedCount = () => 0,
  } = options;

  const jwt = {
    verifyAsync: vi.fn(async (tokenArg: string) => {
      try {
        return await verify(tokenArg);
      } catch {
        throw new Error('invalid token');
      }
    }),
  } as unknown as JwtService;

  const prisma = {
    user: { findUnique: vi.fn(async () => (userExists ? { id: 'usr_1' } : null)) },
    homeMember: {
      findUnique: vi.fn(
        async ({ where }: { where: { homeId_userId: { homeId: string; userId: string } } }) =>
          memberOf(where.homeId_userId.homeId) ? { id: 'mem_1' } : null,
      ),
    },
    home: {
      count: vi.fn(async ({ where }: { where: { id: string; ownerId: string } }) =>
        where.ownerId === 'usr_1' ? ownedCount(where.id) : 0,
      ),
    },
  } as unknown as PrismaService;

  return { gateway: new DeviceGateway(jwt, prisma), jwt, prisma };
}

/** Tunggu antrean microtask selesai (auth melibatkan beberapa await). */
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('DeviceGateway — autentikasi handshake', () => {
  it('menolak koneksi tanpa token', async () => {
    const { gateway } = buildGateway();
    const ws = fakeClient();

    gateway.handleConnection(ws.client);
    await tick();

    const err = ws.emittedOf('error:code');
    expect(err).toHaveLength(1);
    expect(err[0].payload).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(ws.isDisconnected()).toBe(true);
    expect(ws.emittedOf('auth:ok')).toHaveLength(0);
  });

  it('menolak token yang tidak valid', async () => {
    const { gateway } = buildGateway({
      verify: () => {
        throw new Error('jwt malformed');
      },
    });
    const ws = fakeClient({ token: 'token.ngawur' });

    gateway.handleConnection(ws.client);
    await tick();

    expect(ws.emittedOf('error:code')[0].payload).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Token tidak valid atau kedaluwarsa.',
    });
    expect(ws.isDisconnected()).toBe(true);
  });

  it('menolak token valid bila user sudah tidak ada', async () => {
    // Token secara kriptografis sah, tapi akunnya dihapus.
    const { gateway } = buildGateway({ userExists: false });
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);
    await tick();

    expect(ws.emittedOf('error:code')[0].payload).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Pengguna tidak ditemukan.',
    });
    expect(ws.isDisconnected()).toBe(true);
  });

  it('menerima token sah dan memberi tahu userId', async () => {
    const { gateway } = buildGateway();
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);
    await tick();

    expect(ws.emittedOf('auth:ok')[0].payload).toEqual({ userId: 'usr_1' });
    expect(ws.isDisconnected()).toBe(false);
  });
});

describe('DeviceGateway — join room', () => {
  it('mengizinkan pemilik masuk roomnya', async () => {
    const { gateway } = buildGateway({ ownedCount: (homeId) => (homeId === 'home_1' ? 1 : 0) });
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);
    await tick();
    await ws.send('home:join', { homeId: 'home_1' });

    expect(ws.joined).toEqual(['home:home_1']);
    expect(ws.emittedOf('home:joined')[0].payload).toEqual({ homeId: 'home_1' });
  });

  it('mengizinkan anggota masuk room rumah', async () => {
    const { gateway } = buildGateway({ memberOf: (homeId) => homeId === 'home_2' });
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);
    await tick();
    await ws.send('home:join', { homeId: 'home_2' });

    expect(ws.joined).toEqual(['home:home_2']);
  });

  it('menolak join rumah orang lain dengan FORBIDDEN', async () => {
    const { gateway } = buildGateway({ ownedCount: () => 0, memberOf: () => false });
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);
    await tick();
    await ws.send('home:join', { homeId: 'home_orang_lain' });

    expect(ws.joined).toEqual([]);
    expect(ws.emittedOf('home:joined')).toHaveLength(0);
    expect(ws.emittedOf('error:code')[0].payload).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('mengabaikan join tanpa homeId', async () => {
    const { gateway } = buildGateway();
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);
    await tick();
    await ws.send('home:join', {});

    expect(ws.joined).toEqual([]);
    expect(ws.emitted).toHaveLength(1); // hanya auth:ok
  });

  it('tidak joining kalau autentikasi gagal', async () => {
    const { gateway } = buildGateway();
    const ws = fakeClient(); // tanpa token

    gateway.handleConnection(ws.client);
    await ws.send('home:join', { homeId: 'home_1' });

    expect(ws.joined).toEqual([]);
  });
});

describe('DeviceGateway — regression listener home:join sinkron', () => {
  it('listener home:join terdaftar SEBELUM auth selesai', async () => {
    // Kalau listener didaftarkan setelah `await`, join yang dipancarkan client
    // pada tick yang sama akan hilang tanpa balasan — dashboard diam.
    const { gateway } = buildGateway({ ownedCount: () => 1 });
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);

    // Tidak menunggu tick sama sekali: client langsung emit.
    expect(ws.hasListener('home:join')).toBe(true);

    const promise = ws.send('home:join', { homeId: 'home_1' });
    await promise;

    expect(ws.joined).toEqual(['home:home_1']);
    expect(ws.emittedOf('home:joined')).toHaveLength(1);
  });

  it('emit sebelum auth selesai tetap diproses setelahnya', async () => {
    const { gateway } = buildGateway({ ownedCount: () => 1 });
    const ws = fakeClient({ token: 'jwt.sah' });

    gateway.handleConnection(ws.client);
    // Langsung kirim join tanpa menunggu auth:ok sama sekali.
    await ws.send('home:join', { homeId: 'home_1' });

    expect(ws.joined).toEqual(['home:home_1']);
    expect(ws.emittedOf('home:joined')).toHaveLength(1);
  });
});

describe('DeviceGateway — emit ke room', () => {
  it('mengirim device:state hanya ke room rumah itu', () => {
    const { gateway } = buildGateway();
    const to = vi.fn().mockReturnValue({ emit: vi.fn() });
    const emit = vi.fn();
    to.mockReturnValue({ emit });
    gateway.server = { to } as unknown as DeviceGateway['server'];

    gateway.emitDeviceState('home_1', 'dev_1', { power: true });

    expect(to).toHaveBeenCalledWith('home:home_1');
    expect(emit).toHaveBeenCalledWith('device:state', {
      homeId: 'home_1',
      deviceId: 'dev_1',
      state: { power: true },
    });
  });

  it('tidak mengirim apa pun tanpa homeId', () => {
    const { gateway } = buildGateway();
    const to = vi.fn();
    gateway.server = { to } as unknown as DeviceGateway['server'];

    gateway.emitDeviceState('', 'dev_1', {});
    gateway.emitNexaState('', 'IDLE');

    expect(to).not.toHaveBeenCalled();
  });

  it('tidak melempar walau server belum siap', () => {
    const { gateway } = buildGateway();
    // server undefined saat app belum listen.
    expect(() => gateway.emitDeviceState('home_1', 'dev_1', {})).not.toThrow();
    expect(() => gateway.emitNexaState('home_1', 'IDLE')).not.toThrow();
  });
});
