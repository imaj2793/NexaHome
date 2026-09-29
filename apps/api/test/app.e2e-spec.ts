import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E smoke (Fase B.3): alur inti yang harus selalu hijau di CI —
 * register → login → buat home → buat room → buat device → kirim command →
 * verifikasi state tersimpan.
 */
describe('NexaHome API (e2e smoke)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let auth: { Authorization: string };
  let homeId: string;
  let deviceId: string;

  const email = `e2e-${Date.now()}@nexahome.test`;
  const password = 'rahasia123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    http = app.getHttpServer();
  });

  afterAll(async () => {
    // Bersihkan data uji (cascade ke home/device/refresh token).
    await prisma?.user.deleteMany({ where: { email } });
    await app?.close();
  });

  it('register lalu login mengembalikan sesi', async () => {
    const register = await request(http)
      .post('/api/auth/register')
      .send({ email, password, name: 'E2E' })
      .expect(201);
    expect(register.body.accessToken).toBeTruthy();
    expect(register.body.refreshToken).toBeTruthy();

    const login = await request(http)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.body.user.email).toBe(email);
    auth = { Authorization: `Bearer ${login.body.accessToken}` };
  });

  it('membuat home, room, dan device', async () => {
    const home = await request(http)
      .post('/api/homes')
      .set(auth)
      .send({ name: 'Rumah E2E' })
      .expect(201);
    homeId = home.body.id;

    const room = await request(http)
      .post('/api/rooms')
      .set(auth)
      .send({ name: 'Kamar', homeId })
      .expect(201);

    const device = await request(http)
      .post('/api/devices')
      .set(auth)
      .send({
        name: 'Lampu E2E',
        type: 'light',
        homeId,
        roomId: room.body.id,
        capabilities: ['power', 'brightness'],
        state: { power: false, brightness: 0 },
      })
      .expect(201);
    deviceId = device.body.id;
    expect(device.body.name).toBe('Lampu E2E');
  });

  it('mengeksekusi command dan menyimpan state baru', async () => {
    const command = await request(http)
      .post(`/api/devices/${deviceId}/commands`)
      .set(auth)
      .send({ action: 'turn_on' })
      .expect(201);
    expect(command.body.state.power).toBe(true);

    const fetched = await request(http)
      .get(`/api/devices/${deviceId}`)
      .set(auth)
      .expect(200);
    expect(fetched.body.state.power).toBe(true);
  });

  it('menolak command yang tidak dikenal', async () => {
    await request(http)
      .post(`/api/devices/${deviceId}/commands`)
      .set(auth)
      .send({ action: 'ledakan' })
      .expect(400);
  });

  it('menolak request tanpa token', async () => {
    await request(http).get('/api/devices').expect(401);
  });
});
