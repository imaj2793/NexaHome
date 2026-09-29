import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommandResult,
  DeviceCoreService,
  ExecutableDevice,
} from '../device-core/device-core.service';
import { ScenesService } from '../scenes/scenes.service';
import { AutomationService } from '../automation/automation.service';
import { EnergyService } from '../energy/energy.service';

/** Definisi tool Nexa yang bisa dipanggil LLM (blueprint §13). */
export interface NexaToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/** Konteks pemanggilan tool: user yang memicu + home opsional. */
export interface NexaToolContext {
  userId: string;
  homeId?: string;
}

/** Hasil eksekusi tool yang selalu aman untuk dikembalikan ke LLM. */
export interface NexaToolResult {
  success: boolean;
  message: string;
  result: unknown;
}

/**
 * Registry + eksekusi tool Nexa (blueprint §13) dengan AI safety layer (§26).
 *
 * Memetakan tool Nexa ke DeviceCoreService + Prisma yang sudah ada. execute()
 * TIDAK PERNAH throw — selalu mengembalikan NexaToolResult, sehingga error
 * apa pun tidak merusak alur percakapan AI.
 */
@Injectable()
export class NexaToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceCore: DeviceCoreService,
    private readonly scenes: ScenesService,
    private readonly automation: AutomationService,
    private readonly energy: EnergyService,
  ) {}

  /** Daftar seluruh tool + JSON Schema yang bisa dipanggil LLM. */
  getToolDefinitions(): NexaToolDefinition[] {
    return [
      {
        name: 'get_devices',
        description: 'Daftar semua perangkat di rumah milik user.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_device_status',
        description: 'Ambil status/state terkini sebuah perangkat.',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'ID perangkat' },
          },
          required: ['device_id'],
        },
      },
      {
        name: 'turn_on_device',
        description: 'Nyalakan perangkat.',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'ID perangkat' },
          },
          required: ['device_id'],
        },
      },
      {
        name: 'turn_off_device',
        description: 'Matikan perangkat.',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'ID perangkat' },
          },
          required: ['device_id'],
        },
      },
      {
        name: 'set_brightness',
        description: 'Atur tingkat kecerahan lampu (0–100).',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'ID perangkat' },
            value: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Kecerahan 0–100',
            },
          },
          required: ['device_id', 'value'],
        },
      },
      {
        name: 'set_color',
        description: 'Atur warna lampu (RGB).',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'ID perangkat' },
            color: {
              type: 'object',
              description: 'Warna dalam ruang RGB (0–255)',
              properties: {
                r: { type: 'number', minimum: 0, maximum: 255 },
                g: { type: 'number', minimum: 0, maximum: 255 },
                b: { type: 'number', minimum: 0, maximum: 255 },
              },
              required: ['r', 'g', 'b'],
            },
          },
          required: ['device_id', 'color'],
        },
      },
      {
        name: 'set_temperature',
        description: 'Atur suhu (untuk AC/termostat, dalam derajat).',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'ID perangkat' },
            value: {
              type: 'number',
              description: 'Suhu target (derajat Celsius)',
            },
          },
          required: ['device_id', 'value'],
        },
      },
      {
        name: 'get_room_status',
        description: 'Status ruangan beserta daftar perangkatnya.',
        parameters: {
          type: 'object',
          properties: {
            room_id: { type: 'string', description: 'ID ruangan' },
          },
          required: ['room_id'],
        },
      },
      {
        name: 'activate_scene',
        description: 'Aktifkan scene berdasarkan nama.',
        parameters: {
          type: 'object',
          properties: {
            scene_name: { type: 'string', description: 'Nama scene' },
          },
          required: ['scene_name'],
        },
      },
      {
        name: 'create_automation',
        description: 'Buat automation baru dari deskripsi natural language.',
        parameters: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Deskripsi automation yang diinginkan',
            },
          },
          required: ['description'],
        },
      },
      {
        name: 'get_energy_usage',
        description: 'Ambil data pemakaian energi (opsional per perangkat).',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'ID perangkat (opsional)' },
          },
          required: [],
        },
      },
    ];
  }

  /**
   * Eksekusi tool dengan safety layer (§26): whitelist, try/catch, validasi
   * argumen, dan pengecekan kepemilikan perangkat. Selalu return NexaToolResult.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: NexaToolContext,
  ): Promise<NexaToolResult> {
    try {
      // (1) Whitelist: tolak tool yang tidak dikenal.
      switch (name) {
        case 'get_devices':
          return await this.getDevices(ctx);
        case 'get_device_status':
          return await this.getDeviceStatus(args, ctx);
        case 'turn_on_device':
          return await this.runDeviceCommand(args, ctx, 'turn_on');
        case 'turn_off_device':
          return await this.runDeviceCommand(args, ctx, 'turn_off');
        case 'set_brightness':
          return await this.runDeviceCommand(args, ctx, 'set_brightness');
        case 'set_color':
          return await this.runDeviceCommand(args, ctx, 'set_color');
        case 'set_temperature':
          return await this.runDeviceCommand(args, ctx, 'set_temperature');
        case 'get_room_status':
          return await this.getRoomStatus(args, ctx);
        case 'activate_scene':
          return await this.activateScene(args, ctx);
        case 'create_automation':
          return await this.createAutomation(args, ctx);
        case 'get_energy_usage':
          return await this.getEnergyUsage(args, ctx);
        default:
          return {
            success: false,
            message: `Tool tidak dikenal: ${name}`,
            result: null,
          };
      }
    } catch (error) {
      // (2) Jangan pernah throw — tangkap semua error dan kembalikan sebagai hasil.
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        result: null,
      };
    }
  }

  /** Tool 1: daftar perangkat milik user (termasuk info ruangan). */
  private async getDevices(ctx: NexaToolContext): Promise<NexaToolResult> {
    const devices = await this.prisma.device.findMany({
      where: { home: { ownerId: ctx.userId } },
      include: { room: true },
    });
    return {
      success: true,
      message: `Ditemukan ${devices.length} perangkat.`,
      result: devices,
    };
  }

  /** Tool 2: status/state terkini sebuah perangkat. */
  private async getDeviceStatus(
    args: Record<string, unknown>,
    ctx: NexaToolContext,
  ): Promise<NexaToolResult> {
    const deviceId = this.requireString(args.device_id);
    if (deviceId === null) {
      return this.invalidArg('device_id harus berupa string non-kosong.');
    }

    const loaded = await this.loadDevice(ctx, deviceId);
    if (this.isToolResult(loaded)) {
      return loaded;
    }

    return {
      success: true,
      message: `Status perangkat ${loaded.name}.`,
      result: { device_id: loaded.id, state: loaded.state },
    };
  }

  /**
   * Tool 3–7: perintah ke perangkat lewat DeviceCoreService.
   * Memvalidasi argumen per action, lalu meneruskan ke executeCommand.
   */
  private async runDeviceCommand(
    args: Record<string, unknown>,
    ctx: NexaToolContext,
    action: 'turn_on' | 'turn_off' | 'set_brightness' | 'set_color' | 'set_temperature',
  ): Promise<NexaToolResult> {
    const deviceId = this.requireString(args.device_id);
    if (deviceId === null) {
      return this.invalidArg('device_id harus berupa string non-kosong.');
    }

    // Validasi nilai spesifik per action.
    let value: unknown;
    if (action === 'set_brightness') {
      const v = this.requireNumberInRange(args.value, 0, 100);
      if (v === null) {
        return this.invalidArg('value harus berupa angka 0–100.');
      }
      value = v;
    } else if (action === 'set_temperature') {
      const v = this.requireFiniteNumber(args.value);
      if (v === null) {
        return this.invalidArg('value harus berupa angka.');
      }
      value = v;
    } else if (action === 'set_color') {
      const color = this.requireColor(args.color);
      if (color === null) {
        return this.invalidArg(
          'color harus berupa objek { r, g, b } dengan angka 0–255.',
        );
      }
      value = color;
    }

    const loaded = await this.loadDevice(ctx, deviceId);
    if (this.isToolResult(loaded)) {
      return loaded;
    }

    const result: CommandResult = await this.deviceCore.executeCommand(
      loaded,
      action,
      value,
    );
    return {
      success: true,
      message: result.message,
      result,
    };
  }

  /** Tool 8: status ruangan + daftar perangkatnya. */
  private async getRoomStatus(
    args: Record<string, unknown>,
    ctx: NexaToolContext,
  ): Promise<NexaToolResult> {
    const roomId = this.requireString(args.room_id);
    if (roomId === null) {
      return this.invalidArg('room_id harus berupa string non-kosong.');
    }

    const room = await this.prisma.room.findFirst({
      where: { id: roomId, home: { ownerId: ctx.userId } },
      include: { devices: true },
    });

    if (!room) {
      return {
        success: false,
        message: 'Ruangan tidak ditemukan.',
        result: null,
      };
    }

    return {
      success: true,
      message: `Ruangan ${room.name} memiliki ${room.devices.length} perangkat.`,
      result: room,
    };
  }

  /** Tool: aktifkan scene berdasarkan nama (blueprint §18). */
  private async activateScene(
    args: Record<string, unknown>,
    ctx: NexaToolContext,
  ): Promise<NexaToolResult> {
    const sceneName = this.requireString(args.scene_name);
    if (sceneName === null) {
      return this.invalidArg('scene_name harus berupa string non-kosong.');
    }

    const scene = await this.prisma.scene.findFirst({
      where: {
        home: { ownerId: ctx.userId },
        name: { equals: sceneName, mode: 'insensitive' },
      },
    });
    if (!scene) {
      return {
        success: false,
        message: `Scene "${sceneName}" tidak ditemukan.`,
        result: null,
      };
    }

    const result = await this.scenes.activate(ctx.userId, scene.id);
    return { success: true, message: result.message, result };
  }

  /** Tool: buat automation draft dari deskripsi (blueprint §19, §21). */
  private async createAutomation(
    args: Record<string, unknown>,
    ctx: NexaToolContext,
  ): Promise<NexaToolResult> {
    const description = this.requireString(args.description);
    if (description === null) {
      return this.invalidArg('description harus berupa string non-kosong.');
    }

    const home = await this.prisma.home.findFirst({
      where: { ownerId: ctx.userId },
    });
    if (!home) {
      return { success: false, message: 'Home tidak ditemukan.', result: null };
    }

    const automation = await this.automation.create(ctx.userId, {
      name: description,
      homeId: home.id,
      enabled: true,
      triggers: [],
      actions: [],
    });
    return {
      success: true,
      message: `Automation "${description}" dibuat (draft).`,
      result: automation,
    };
  }

  /** Tool: ringkasan pemakaian energi (blueprint fase 7). */
  private async getEnergyUsage(
    _args: Record<string, unknown>,
    ctx: NexaToolContext,
  ): Promise<NexaToolResult> {
    const summary = await this.energy.summary(ctx.userId);
    return {
      success: true,
      message: `Total pemakaian ${summary.totalWatts} W.`,
      result: summary,
    };
  }

  /**
   * Helper (§26): validasi + muat perangkat milik user. Mengembalikan device
   * jika valid & dimiliki, atau NexaToolResult kegagalan jika tidak.
   */
  private async loadDevice(
    ctx: NexaToolContext,
    deviceId: string,
  ): Promise<ExecutableDevice | NexaToolResult> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, home: { ownerId: ctx.userId } },
      include: { integration: true },
    });

    if (!device) {
      return {
        success: false,
        message: 'Perangkat tidak ditemukan.',
        result: null,
      };
    }

    // Struktural cocok dengan ExecutableDevice (id, name, homeId,
    // integrationId, externalId, state).
    return device as ExecutableDevice;
  }

  /** Type guard: bedakan device vs hasil kegagalan dari loadDevice. */
  private isToolResult(
    value: ExecutableDevice | NexaToolResult,
  ): value is NexaToolResult {
    return 'success' in value;
  }

  private invalidArg(message: string): NexaToolResult {
    return { success: false, message, result: null };
  }

  private requireString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }

  private requireFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private requireNumberInRange(
    value: unknown,
    min: number,
    max: number,
  ): number | null {
    const n = this.requireFiniteNumber(value);
    return n !== null && n >= min && n <= max ? n : null;
  }

  private requireColor(value: unknown): { r: number; g: number; b: number } | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const { r, g, b } = value as Record<string, unknown>;
    if (
      this.requireNumberInRange(r, 0, 255) === null ||
      this.requireNumberInRange(g, 0, 255) === null ||
      this.requireNumberInRange(b, 0, 255) === null
    ) {
      return null;
    }
    return { r: r as number, g: g as number, b: b as number };
  }
}
