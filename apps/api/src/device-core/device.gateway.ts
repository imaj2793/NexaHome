import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/jwt.strategy';

/**
 * Gateway real-time. Setiap event dikirim ke room per home, dan client
 * harus menyertakan access token yang valid saat handshake — tanpa itu
 * satu dashboard bisa membaca state devices milik orang lain.
 */

/** Room socket.io untuk sebuah home. */
const roomOf = (homeId: string): string => `home:${homeId}`;

/**
 * CORS websocket mengikuti CORS_ORIGIN yang sama dengan HTTP. Nilai dibaca
 * saat koneksi terjadi (bukan saat dekorasi dievaluasi) supaya dotenv dari
 * ConfigModule sudah termuat.
 */
function allowOrigin(origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void): void {
  const allowed = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowed.length === 0) {
    // Tanpa allowlist eksplisit: izinkan same-origin/tooling lokal saja.
    callback(null, !origin || /localhost|127\.0\.0\.1/.test(origin));
    return;
  }
  callback(null, Boolean(origin) && allowed.includes(origin as string));
}

@WebSocketGateway({ cors: { origin: allowOrigin } })
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(DeviceGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Authenticate handshake, lalu izinkan client join room home-nya.
   *
   * Listener `home:join` didaftarkan SEBELUM proses auth selesai. Client
   * biasanya langsung memancarkan join begitu koneksinya menyala; kalau
   * listener-nya baru muncul setelah beberapa `await`, join itu hilang
   * tanpa balasan dan dashboard hanya diam.
   */
  handleConnection(client: Socket): void {
    const authenticated = this.authenticate(client);

    client.on('home:join', async (data: { homeId?: string }) => {
      const result = await authenticated;
      if (!result.ok) return;
      const homeId = data?.homeId;
      if (!homeId) return;

      const allowed = await this.canAccessHome(result.userId, homeId);
      if (!allowed) {
        client.emit('error:code', {
          code: 'FORBIDDEN',
          message: 'Anda bukan anggota rumah ini.',
        });
        return;
      }
      await client.join(roomOf(homeId));
      client.emit('home:joined', { homeId });
    });

    void authenticated.then((result) => {
      if (result.ok) {
        client.emit('auth:ok', { userId: result.userId });
      } else {
        this.reject(client, result.message);
      }
    });
  }

  /** Verifikasi token handshake + masih ada di database. */
  private async authenticate(
    client: Socket,
  ): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
    const token = extractToken(client);
    if (!token) {
      return { ok: false, message: 'Token tidak ditemukan pada handshake.' };
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return { ok: false, message: 'Token tidak valid atau kedaluwarsa.' };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });
    if (!user) return { ok: false, message: 'Pengguna tidak ditemukan.' };

    client.data.userId = user.id;
    return { ok: true, userId: user.id };
  }

  /** Pemilik atau anggota? */
  private async canAccessHome(
    userId: string,
    homeId: string,
  ): Promise<boolean> {
    const [member, owned] = await Promise.all([
      this.prisma.homeMember.findUnique({
        where: { homeId_userId: { homeId, userId } },
        select: { id: true },
      }),
      this.prisma.home.count({ where: { id: homeId, ownerId: userId } }),
    ]);
    return Boolean(member) || owned > 0;
  }

  handleDisconnect(client: Socket): void {
    // socket.io otomatis melepas client dari semua room miliknya.
    client.data.userId = undefined;
  }

  emitDeviceState(
    homeId: string,
    deviceId: string,
    state: Record<string, unknown>,
  ): void {
    if (!homeId) return;
    this.server?.to(roomOf(homeId)).emit('device:state', { homeId, deviceId, state });
  }

  emitNexaState(homeId: string, state: string, message?: string): void {
    if (!homeId) return;
    this.server?.to(roomOf(homeId)).emit('nexa.state', { homeId, state, message });
  }

  private reject(client: Socket, reason: string): void {
    this.logger.warn(`Handshake WebSocket ditolak: ${reason}`);
    client.emit('error:code', { code: 'UNAUTHORIZED', message: reason });
    client.disconnect(true);
  }
}

/** Token bisa dikirim lewat auth.token, query.token, atau header. */
function extractToken(client: Socket): string | undefined {
  const handshake = client.handshake;
  const candidates: unknown[] = [
    (handshake.auth as Record<string, unknown> | undefined)?.token,
    handshake.query?.token,
    handshake.headers?.authorization,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length === 0) continue;
    return candidate.replace(/^Bearer\s+/i, '').trim();
  }
  return undefined;
}
