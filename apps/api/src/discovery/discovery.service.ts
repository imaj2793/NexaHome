import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationType } from '@prisma/client';
import { DiscoveredDevice, IntegrationManager } from '@nexahome/device-core';
import { Bonjour, Browser, Service } from 'bonjour-service';
import { PrismaService } from '../prisma/prisma.service';

/** Tipe service mDNS (DNS-SD) yang di-scan — lintas vendor. */
const IOT_SERVICES = [
  { type: 'esphomelib', protocol: 'tcp', vendor: 'esphome' },
  { type: 'tasmota', protocol: 'tcp', vendor: 'tasmota' },
  { type: 'shelly', protocol: 'tcp', vendor: 'shelly' },
  { type: 'hap', protocol: 'tcp', vendor: 'homekit' },
] as const;

/** Pemetaan vendor → tipe integration (untuk routing universal). */
const VENDOR_TO_TYPE: Record<string, string> = {
  tasmota: 'TASMOTA',
  shelly: 'SHELLY',
  esphome: 'ESP32',
  homekit: 'HOME_ASSISTANT',
  mqtt: 'MQTT',
};

export interface ConnectDevicePayload {
  id: string;
  name: string;
  type: string;
  capabilities?: string[];
  state?: Record<string, unknown>;
  vendor?: string;
}

export interface ConnectDeviceInput {
  homeId: string;
  roomId?: string | null;
  integrationId?: string | null;
  device: ConnectDevicePayload;
}

/**
 * Discovery universal (blueprint §8): memindai jaringan via mDNS (DNS-SD)
 * untuk perangkat IoT lintas vendor (ESPHome, Tasmota, Shelly, HomeKit) dan
 * menggabungkannya dengan hasil discovery seluruh integration terdaftar.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private readonly bonjour = new Bonjour();

  constructor(
    private readonly manager: IntegrationManager,
    private readonly prisma: PrismaService,
  ) {}

  async scanNetwork(timeoutMs = 4000): Promise<DiscoveredDevice[]> {
    const [mdns, adapters] = await Promise.all([
      this.scanMdns(timeoutMs),
      this.manager.discoverAll(),
    ]);
    const seen = new Set<string>();
    const merged: DiscoveredDevice[] = [];
    for (const d of [...mdns, ...adapters]) {
      const key = `${d.vendor ?? ''}:${d.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(d);
    }
    return merged;
  }

  async connect(userId: string, input: ConnectDeviceInput) {
    const { homeId, roomId, integrationId, device } = input;

    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ownerId: userId },
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');

    let integration: { id: string } | null = null;
    if (integrationId) {
      integration = await this.prisma.integration.findFirst({
        where: { id: integrationId, homeId },
      });
    } else {
      const type = VENDOR_TO_TYPE[device.vendor ?? ''] ?? 'MQTT';
      integration = await this.prisma.integration.findFirst({
        where: { homeId, type: type as IntegrationType },
      });
      if (!integration) {
        integration = await this.prisma.integration.create({
          data: {
            name: type,
            type: type as IntegrationType,
            homeId,
            enabled: true,
            config: {},
          },
        });
      }
    }

    if (!integration) throw new NotFoundException('Integrasi tidak ditemukan.');

    return this.prisma.device.create({
      data: {
        name: device.name,
        type: device.type,
        homeId,
        roomId: roomId ?? null,
        integrationId: integration.id,
        externalId: device.id,
        capabilities: device.capabilities ?? [],
        state: (device.state ?? {}) as object,
      },
    });
  }

  private scanMdns(timeoutMs: number): Promise<DiscoveredDevice[]> {
    return new Promise((resolve) => {
      const results: DiscoveredDevice[] = [];
      const browsers: Browser[] = [];
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        browsers.forEach((b) => b.stop());
        resolve(results);
      };

      for (const svc of IOT_SERVICES) {
        try {
          const browser = this.bonjour.find({
            type: svc.type,
            protocol: svc.protocol,
          });
          browsers.push(browser);
          browser.on('up', (service: Service) => {
            const ip = service.addresses?.[0] ?? service.host ?? service.name;
            results.push({
              id: ip,
              name: service.name ?? `${svc.vendor} device`,
              type: 'switch',
              capabilities: ['power'],
              state: { power: false },
              vendor: svc.vendor,
            });
          });
        } catch (err) {
          this.logger.warn(
            `mDNS browse ${svc.type} gagal: ${(err as Error).message}`,
          );
        }
      }

      setTimeout(finish, timeoutMs);
    });
  }
}
