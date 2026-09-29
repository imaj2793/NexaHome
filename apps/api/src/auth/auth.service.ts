import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthResponse, AuthUser } from '@nexahome/types';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private toAuthUser(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as AuthUser['role'],
      createdAt: user.createdAt.toISOString(),
    };
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email sudah terdaftar.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name ?? null,
      },
    });

    return this.buildSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Email atau password salah.');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Email atau password salah.');
    }

    return this.buildSession(user);
  }

  /**
   * Tukar refresh token dengan sesi baru (rotasi: token lama langsung dicabut).
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!row || row.revokedAt || row.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token tidak valid.');
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    return this.buildSession(row.user);
  }

  /** Cabut refresh token (logout). Idempoten. */
  async logout(refreshToken: string): Promise<{ success: boolean }> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  private async buildSession(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
  }): Promise<AuthResponse> {
    return {
      accessToken: await this.sign(user),
      refreshToken: await this.issueRefreshToken(user.id),
      user: this.toAuthUser(user),
    };
  }

  private sign(user: { id: string; email: string; role: string }) {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  /** Buat refresh token acak; hanya hash-nya yang disimpan di DB. */
  private async issueRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const ttlDays = Number(
      this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') ?? 30,
    );
    const days = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(token), expiresAt },
    });
    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
