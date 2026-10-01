import {
  AdapterCredentials,
  DiscoveredDevice,
  IntegrationAdapter,
  IntegrationCommand,
  IntegrationType,
} from './integration';

/**
 * Registry adapter integration + routing perintah (blueprint §8 "Integration Manager").
 * NexaHome Core memanggil manager ini; manager meneruskan ke adapter yang tepat.
 */
export class IntegrationManager {
  private readonly adapters = new Map<IntegrationType, IntegrationAdapter>();

  register(adapter: IntegrationAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: IntegrationType): IntegrationAdapter | undefined {
    return this.adapters.get(type);
  }

  has(type: IntegrationType): boolean {
    return this.adapters.has(type);
  }

  list(): IntegrationType[] {
    return [...this.adapters.keys()];
  }

  async executeCommand(
    type: IntegrationType,
    deviceId: string,
    command: IntegrationCommand,
    credentials?: AdapterCredentials,
  ): Promise<Record<string, unknown>> {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Tidak ada integration untuk tipe "${type}".`);
    }
    return adapter.executeCommand(deviceId, command, credentials);
  }

  async discover(
    type: IntegrationType,
    credentials?: AdapterCredentials,
  ): Promise<DiscoveredDevice[]> {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Tidak ada integration untuk tipe "${type}".`);
    }
    return adapter.discoverDevices(credentials);
  }

  /**
   * Discovery gabungan dari SEMUA integration yang terdaftar.
   *
   * `resolve` dipakai untuk kredensial integrasi: manager tidak menyentuh
   * database, jadi pemanggil yang tahu kredensial milik siapa harus
   * meneruskannya lewat callback. Tanpa `resolve`, adapter memakai kredensial
   * global yang dibakura di env.
   */
  async discoverAll(
    resolve?: (type: IntegrationType) => AdapterCredentials | undefined,
  ): Promise<DiscoveredDevice[]> {
    const results: DiscoveredDevice[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        results.push(...(await adapter.discoverDevices(resolve?.(adapter.type))));
      } catch {
        // lewati adapter yang gagal — satu adapter down tak boleh gagalkan scan.
      }
    }
    return results;
  }
}
