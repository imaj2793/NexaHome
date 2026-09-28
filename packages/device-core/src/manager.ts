import {
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
  ): Promise<Record<string, unknown>> {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Tidak ada integration untuk tipe "${type}".`);
    }
    return adapter.executeCommand(deviceId, command);
  }

  async discover(type: IntegrationType): Promise<DiscoveredDevice[]> {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Tidak ada integration untuk tipe "${type}".`);
    }
    return adapter.discoverDevices();
  }
}
