import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AppExceptionFilter } from '../src/common/errors/app-exception.filter';
import { DeviceGateway } from '../src/device-core/device.gateway';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E keamanan (spec §13). Semua yang sebelumnya hanya dicek manual lewat curl
 * sekarang dikunci di sini, supaya regresinya tertangkap CI dan tidak perlu
 * diulang setiap rilis.
 *
 * Cakupannya:
 *  - handshake WebSocket: tanpa token, token rusak, token milik user dihapus
 *  - isolasi antar-home: join ke room yang bukan miliknya, dan event
 *    perangkat rumah lain tidak boleh diterima
 *  - isolasi antar-tenant di HTTP: perangkat, room, dan integrasi milik orang
 *    lain tidak bisa dibaca atau diubah
 *  - kredensial integrasi: tidak pernah kembali apa adanya, dan owner-only
 */
describe('E2E keamanan', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;
  let wsUrl: string;

  /** Hasil auth handshake: diterima atau ditolak. */
type AuthOutcome = { kind: 'ok'; userId: string } | { kind: 'rejected'; code: string };

const stamp = Date.now();
  const ownerEmail = `sec-owner-${stamp}@nexahome.test`;
  const otherEmail = `sec-other-${stamp}@nexahome.test`;
  const password = 'rahasia123';

  const owner = { Authorization: '' };
  const other = { Authorization: '' };

  let homeId: string;
  let otherHomeId: string;
  let deviceId: string;
  let otherDeviceId: string;
  let roomId: string;
  let integrationId: string;

  const secretPassword = 'broker-rahasia-jangan-bocor';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Sama dengan main.ts: tanpa filter ini, body error keluar apa adanya
    // dan kontrak §13 tidak ikut teruji.
    app.useGlobalFilters(new AppExceptionFilter());
    // WS diuji lewat socket.io-client sungguhan, jadi gateway tidak di-bind ke
    // port acak: port tetap diambil dari httpServer Nest.
    await app.listen(0);

    prisma = app.get(PrismaService);
    http = app.getHttpServer() as Server;
    wsUrl = `ws://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app?.close();
  });

  const register = async (email: string) => {
    await request(http)
      .post('/api/auth/register')
      .send({ email, password, name: 'E2E' })
      .expect(201);
    const login = await request(http)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return `Bearer ${login.body.accessToken}`;
  };

  /**
   * Buka koneksi WebSocket dan Pasif menunggu hasil auth.
   *
   * Listener dipasang sebelum handshake selesai: server memancarkan
   * `auth:ok`/`error:code` segera setelah koneksi siap, jadi listener yang
   * baru dipasang setelah `await connect` akanmiss event itu.
   */
  const openWs = async (token?: string) => {
    const socket = io(wsUrl, {
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
      forceNew: true,
    });

    const outcome = new Promise<AuthOutcome>((resolve) => {
      socket.once('auth:ok', (payload: { userId: string }) =>
        resolve({ kind: 'ok', userId: payload.userId }),
      );
      socket.once('error:code', (payload: { code: string }) =>
        resolve({ kind: 'rejected', code: payload.code }),
      );
    });

    const connected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('WebSocket tidak merespons dalam 5 detik.')),
        5_000,
      );
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    try {
      await connected;
    } catch (error) {
      socket.close();
      // Handshake ditolak di level transport: server tidak sempat mengirim
      // error:code, jadi kode UNAUTHORIZED tidak bisa diasumsikan di sini.
      throw error;
    }

    return { socket, outcome };
  };

  /** Tunggu event berikutnya, atau null kalau tidak datang dalam ms. */
  const next = <T>(socket: Socket, event: string, ms = 2000): Promise<T | null> =>
    new Promise<T | null>((resolve) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        resolve(null);
      }, ms);
      const handler = (payload: T) => {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });

  /**
   * Ambil satu integrasi dari daftar.
   *
   * Tidak ada route `GET /integrations/:id` di API sekarang, jadi test
   * tidak boleh bergantung pada endpoint yang tidak ada.
   */
  const findIntegration = async (id: string, auth: { Authorization: string }) => {
    const listed = await request(http).get('/api/integrations').set(auth).expect(200);
    return listed.body.find((i: { id: string }) => i.id === id);
  };

  it('menyiapkan dua pengguna, dua rumah, dan integrasi berkredensial', async () => {
    owner.Authorization = await register(ownerEmail);
    other.Authorization = await register(otherEmail);

    const a = await request(http)
      .post('/api/homes')
      .set(owner)
      .send({ name: 'Rumah Owner' })
      .expect(201);
    homeId = a.body.id;

    const b = await request(http)
      .post('/api/homes')
      .set(other)
      .send({ name: 'Rumah Orang Lain' })
      .expect(201);
    otherHomeId = b.body.id;

    const room = await request(http)
      .post('/api/rooms')
      .set(owner)
      .send({ name: 'Kamar', homeId })
      .expect(201);
    roomId = room.body.id;

    const device = await request(http)
      .post('/api/devices')
      .set(owner)
      .send({
        name: 'Lampu Owner',
        type: 'light',
        homeId,
        roomId,
        capabilities: ['power'],
        state: { power: false },
      })
      .expect(201);
    deviceId = device.body.id;

    const otherDevice = await request(http)
      .post('/api/devices')
      .set(other)
      .send({
        name: 'Lampu Orang Lain',
        type: 'light',
        homeId: otherHomeId,
        capabilities: ['power'],
        state: { power: false },
      })
      .expect(201);
    otherDeviceId = otherDevice.body.id;

    const integration = await request(http)
      .post('/api/integrations')
      .set(owner)
      .send({
        name: 'Broker Owner',
        type: 'MQTT',
        homeId,
        config: {
          brokerUrl: 'mqtt://broker-rahasia:1883',
          username: 'admin',
          password: secretPassword,
        },
      })
      .expect(201);
    integrationId = integration.body.id;
  });

  describe('handshake WebSocket', () => {
    it('menolak koneksi tanpa token', async () => {
      const { socket, outcome } = await openWs();
      const result = await outcome;

      // Server tetap sempat menerima transport lalu menolak handshake-nya,
      // jadi yang dicek adalah kode error yang dikirim.
      expect(result.kind).toBe('rejected');
      if (result.kind === 'rejected') expect(result.code).toBe('UNAUTHORIZED');
      socket.close();
    });

    it('menolak token yang rusak', async () => {
      const { socket, outcome } = await openWs('token-ngawur');
      const result = await outcome;

      expect(result).toEqual({ kind: 'rejected', code: 'UNAUTHORIZED' });
      socket.close();
    });

    it('menerima token valid dan memberi userId', async () => {
      const token = owner.Authorization.replace('Bearer ', '');
      const { socket, outcome } = await openWs(token);

      const result = await outcome;
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') expect(result.userId).toBeTruthy();
      socket.close();
    });

    it('menolak token milik pengguna yang sudah dihapus', async () => {
      const email = `sec-hapus-${stamp}@nexahome.test`;
      const token = (await register(email)).replace('Bearer ', '');
      await prisma.user.delete({ where: { email } });

      const { socket, outcome } = await openWs(token);

      // Tanpa pengecekan database, token yang sah secara tanda tangan tetap
      // diterima setelah akun dihapus.
      expect(await outcome).toEqual({ kind: 'rejected', code: 'UNAUTHORIZED' });
      socket.close();
    });

    it('menerima token lewat query string juga', async () => {
      const token = owner.Authorization.replace('Bearer ', '');
      const socket = io(`${wsUrl}?token=${encodeURIComponent(token)}`, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      const payload = await next<{ userId: string }>(socket, 'auth:ok');

      expect(payload).toBeTruthy();
      socket.close();
    });
  });

  describe('isolasi antar-home', () => {
    it('menolak join ke rumah yang bukan miliknya', async () => {
      const token = other.Authorization.replace('Bearer ', '');
      const { socket } = await openWs(token);

      socket.emit('home:join', { homeId });
      const payload = await next<{ code: string }>(socket, 'error:code');

      expect(payload?.code).toBe('FORBIDDEN');
      socket.close();
    });

    it('tidak menerima event perangkat rumah lain setelah join', async () => {
      const token = other.Authorization.replace('Bearer ', '');
      const { socket } = await openWs(token);

      socket.emit('home:join', { homeId: otherHomeId });
      expect(await next(socket, 'home:joined')).toEqual({ homeId: otherHomeId });

      // Perintah ke perangkat rumah sendiri memicu emit ke room-nya, jadi
      // listener harus sudah terpasang sebelum dicek.
      const ownEvent = next<{ deviceId: string }>(socket, 'device:state');
      await request(http)
        .post(`/api/devices/${otherDeviceId}/commands`)
        .set(other)
        .send({ action: 'turn_on' })
        .expect(201);
      expect((await ownEvent)?.deviceId).toBe(otherDeviceId);

      // Broadcast ke room rumah owner harus tidak sampai ke socket ini.
      const leaked = next<{ deviceId: string }>(socket, 'device:state');
      app.get(DeviceGateway).emitDeviceState(homeId, deviceId, { power: true });

      expect(await leaked).toBeNull();
      socket.close();
    });

    it('menolak join tanpa homeId tanpa menutup koneksi', async () => {
      const token = owner.Authorization.replace('Bearer ', '');
      const { socket } = await openWs(token);

      socket.emit('home:join', {});
      socket.emit('home:join', { homeId });

      // Join tanpa homeId diabaikan; join yang sah tetap jalan.
      expect(await next(socket, 'home:joined')).toEqual({ homeId });
      socket.close();
    });
  });

  describe('isolasi antar-tenant di HTTP', () => {
    /**
     * API menjawab 404, bukan 403, untuk sumber daya milik rumah orang lain.
     * Itu disengaja: 403 mengonfirmasi keberadaannya, jadi
 * attacker
     * bisa menebak device id satu per satu.
     */
    it('menolak baca perangkat rumah orang lain', async () => {
      await request(http).get(`/api/devices/${deviceId}`).set(other).expect(404);
      await request(http).get(`/api/devices/${otherDeviceId}`).set(other).expect(200);
    });

    it('menolak kirim perintah ke perangkat rumah orang lain', async () => {
      const response = await request(http)
        .post(`/api/devices/${deviceId}/commands`)
        .set(other)
        .send({ action: 'turn_on' })
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      // Perintah yang ditolak tidak boleh mengubah state perangkat.
      const after = await request(http)
        .get(`/api/devices/${deviceId}`)
        .set(owner)
        .expect(200);
      expect(after.body.state.power).toBe(false);
    });

    it('menolak menulis ke rumah dan perangkat orang lain', async () => {
      await request(http)
        .post('/api/rooms')
        .set(other)
        .send({ name: 'Ruang Pancing', homeId })
        .expect(404);

      await request(http)
        .post('/api/devices')
        .set(other)
        .send({ name: 'Perangkat Pancing', type: 'light', homeId })
        .expect(404);

      await request(http)
        .patch(`/api/devices/${deviceId}`)
        .set(other)
        .send({ name: 'Diretas' })
        .expect(404);

      await request(http)
        .patch(`/api/rooms/${roomId}`)
        .set(other)
        .send({ name: 'Diretas' })
        .expect(404);

      const after = await request(http)
        .get(`/api/devices/${deviceId}`)
        .set(owner)
        .expect(200);
      expect(after.body.name).toBe('Lampu Owner');
    });

    it('menolak menaruh perangkat di room rumah orang lain', async () => {
      const foreignRoom = await request(http)
        .post('/api/rooms')
        .set(other)
        .send({ name: 'Kamar Rahasia Orang Lain', homeId: otherHomeId })
        .expect(201);

      await request(http)
        .patch(`/api/devices/${deviceId}`)
        .set(owner)
        .send({ roomId: foreignRoom.body.id })
        .expect(404);

      await request(http)
        .post('/api/devices')
        .set(owner)
        .send({
          name: 'Perangkat Lintas Rumah',
          type: 'light',
          homeId,
          roomId: foreignRoom.body.id,
        })
        .expect(404);

      // Nama room milik orang lain tidak boleh ikut terbaca lewat perangkat.
      const device = await request(http)
        .get(`/api/devices/${deviceId}`)
        .set(owner)
        .expect(200);
      expect(device.body.room).toEqual(
        expect.objectContaining({ name: 'Kamar' }),
      );
      expect(JSON.stringify(device.body)).not.toContain('Kamar Rahasia');
    });

    it('menolak baca dan ubah integrasi orang lain', async () => {
      const listed = await request(http)
        .get('/api/integrations')
        .set(other)
        .expect(200);
      expect(listed.body).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: integrationId })]),
      );

      await request(http)
        .patch(`/api/integrations/${integrationId}`)
        .set(other)
        .send({ name: 'Diretas' })
        .expect(404);

      // PATCH yang ditolak tidak boleh mengubah nama di database.
      expect((await findIntegration(integrationId, owner)).name).toBe('Broker Owner');
    });

    it('menolak integrasi yang dibuat di rumah orang lain', async () => {
      await request(http)
        .post('/api/integrations')
        .set(other)
        .send({ name: 'Broker Pancing', type: 'MQTT', homeId })
        .expect(404);

      const count = await prisma.integration.count({
        where: { homeId, name: 'Broker Pancing' },
      });
      expect(count).toBe(0);
    });
  });

  describe('kredensial integrasi', () => {
    it('tidak pernah mengembalikan password apa adanya', async () => {
      const found = await findIntegration(integrationId, owner);

      expect(found.credentialsEncrypted).toBe(true);
      // Setiap nilai config disamarkan, termasuk yang bukan rahasia.
      expect(found.config).toEqual({
        brokerUrl: '••••••',
        username: '••••••',
        password: '••••••',
      });
      // Envelope AES tidak boleh ikut terbaca.
      expect(JSON.stringify(found)).not.toMatch(/"(iv|tag|data|keys)":/);
      expect(JSON.stringify(found)).not.toContain(secretPassword);
    });

    it('anggota rumah punya kontrol penuh atas device dan room', async () => {
      // Keputusan produk: anggota = kontrol penuh. Test ini mengunci pilihan
      // itu, termasuk bagian yang harus berubah. Kalau nanti ada granularitas
      // role, test ini yang harus diperbarui lebih dulu — bukan dibiarkan
      // gagal diam-diam.
      const memberEmail = `penuh-${stamp}@nexahome.test`;
      const memberAuth = { Authorization: await register(memberEmail) };
      await request(http)
        .post(`/api/homes/${homeId}/members`)
        .set(owner)
        .send({ email: memberEmail })
        .expect(201);

      // Boleh membuat device dan room.
      const room = await request(http)
        .post('/api/rooms')
        .set(memberAuth)
        .send({ name: 'Kamar Anggota', homeId })
        .expect(201);

      const device = await request(http)
        .post('/api/devices')
        .set(memberAuth)
        .send({
          name: 'Lampu Anggota',
          type: 'light',
          homeId,
          roomId: room.body.id,
          capabilities: ['power'],
          state: { power: false },
        })
        .expect(201);

      // Boleh mengubah dan menjalankan.
      await request(http)
        .patch(`/api/devices/${device.body.id}`)
        .set(memberAuth)
        .send({ name: 'Lampu Anggota (Diretas)' })
        .expect(200);
      const command = await request(http)
        .post(`/api/devices/${device.body.id}/commands`)
        .set(memberAuth)
        .send({ action: 'turn_on' })
        .expect(201);
      expect(command.body.state.power).toBe(true);

      // Boleh menghapus.
      await request(http).delete(`/api/devices/${device.body.id}`).set(memberAuth).expect(200);

      // Tapi tidak boleh menyentuh anggota lain, integrasi, maupun rumah itu
      // sendiri. Semuanya 404, sama seperti sumber daya milik rumah orang
      // lain: 403 akan mengonfirmasi bahwa sumber daya itu ada.
      await request(http)
        .post(`/api/homes/${homeId}/members`)
        .set(memberAuth)
        .send({ email: otherEmail })
        .expect(404);
      await request(http)
        .patch(`/api/integrations/${integrationId}`)
        .set(memberAuth)
        .send({ enabled: false })
        .expect(404);
      const renamed = await request(http)
        .patch(`/api/homes/${homeId}`)
        .set(memberAuth)
        .send({ name: 'Rumah Diambil' })
        .expect(404);
      expect(renamed.body.error.code).toBe('NOT_FOUND');

      await prisma.user.delete({ where: { email: memberEmail } });
    });

    it('kredensial tidak bocor lewat error maupun respons lain', async () => {
      // Endpoint yang menyentuh integrasi: list, discover, dan patch.
      const discover = await request(http)
        .post(`/api/integrations/${integrationId}/discover`)
        .set(owner)
        .expect(201);
      expect(JSON.stringify(discover.body)).not.toContain(secretPassword);

      const patch = await request(http)
        .patch(`/api/integrations/${integrationId}`)
        .set(owner)
        .send({ name: 'Broker Owner' })
        .expect(200);
      expect(JSON.stringify(patch.body)).not.toContain(secretPassword);
      expect(JSON.stringify(patch.body)).not.toMatch(
        /auth tag|scrypt|argon|decipher/i,
      );
    });

    it('anggota rumah boleh membaca tapi tidak menulis kredensial', async () => {
      const memberEmail = `sec-member-${stamp}@nexahome.test`;
      const memberAuth = { Authorization: await register(memberEmail) };
      await request(http)
        .post(`/api/homes/${homeId}/members`)
        .set(owner)
        .send({ email: memberEmail })
        .expect(201);

      // Anggota boleh melihat daftar integrasi dalam bentuk tersamarkan.
      const listed = await request(http)
        .get('/api/integrations')
        .set(memberAuth)
        .expect(200);
      expect(JSON.stringify(listed.body)).not.toContain(secretPassword);

      // Tapi tidak boleh mengubah kredensial: itu hak pemilik rumah.
      await request(http)
        .patch(`/api/integrations/${integrationId}`)
        .set(memberAuth)
        .send({ config: { password: 'dicoba-anggota' } })
        .expect(404);

      expect((await findIntegration(integrationId, owner)).config.password).toBe(
        '••••••',
      );

      await prisma.user.delete({ where: { email: memberEmail } });
    });
  });
});
