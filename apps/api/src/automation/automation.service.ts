import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AutomationTriggerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommandResult,
  DeviceCoreService,
} from '../device-core/device-core.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';

/** Interval evaluasi scheduler (ms). */
const TICK_INTERVAL_MS = 30_000;

/** Bentuk config trigger SCHEDULE: {"time": "HH:mm"}. */
interface ScheduleConfig {
  time?: string;
}

/** Bentuk payload action: { "action": string, "value"?: unknown }. */
interface ActionPayload {
  action?: string;
  value?: unknown;
}

/** Bentuk automation + action yang dibutuhkan engine. */
interface AutomationRecord {
  id: string;
  homeId: string;
  actions: Array<{ deviceId: string | null; action: unknown }>;
}

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFiredMinute: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceCore: DeviceCoreService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---------- CRUD ----------

  async list(userId: string, homeId?: string) {
    if (homeId) await this.assertHomeOwned(userId, homeId);
    return this.prisma.automation.findMany({
      where: {
        home: { ownerId: userId },
        ...(homeId ? { homeId } : {}),
      },
      include: { triggers: true, actions: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(userId: string, id: string) {
    const automation = await this.prisma.automation.findFirst({
      where: { id, home: { ownerId: userId } },
      include: { triggers: true, actions: true },
    });
    if (!automation) throw new NotFoundException('Automation tidak ditemukan.');
    return automation;
  }

  async create(userId: string, dto: CreateAutomationDto) {
    await this.assertHomeOwned(userId, dto.homeId);
    return this.prisma.automation.create({
      data: {
        name: dto.name,
        homeId: dto.homeId,
        enabled: dto.enabled ?? true,
        triggers: {
          create: dto.triggers.map((t) => ({
            type: t.type,
            config: t.config as object,
          })),
        },
        actions: {
          create: dto.actions.map((a) => ({
            deviceId: a.deviceId ?? null,
            action: a.action as object,
          })),
        },
      },
      include: { triggers: true, actions: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateAutomationDto) {
    await this.assertAutomationOwned(userId, id);
    if (dto.homeId !== undefined) {
      await this.assertHomeOwned(userId, dto.homeId);
    }

    const data: Prisma.AutomationUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.homeId !== undefined ? { homeId: dto.homeId } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
    };

    if (dto.triggers !== undefined) {
      data.triggers = {
        deleteMany: {},
        create: dto.triggers.map((t) => ({
          type: t.type,
          config: t.config as object,
        })),
      };
    }
    if (dto.actions !== undefined) {
      data.actions = {
        deleteMany: {},
        create: dto.actions.map((a) => ({
          deviceId: a.deviceId ?? null,
          action: a.action as object,
        })),
      };
    }

    return this.prisma.automation.update({
      where: { id },
      data,
      include: { triggers: true, actions: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertAutomationOwned(userId, id);
    return this.prisma.automation.delete({ where: { id } });
  }

  // ---------- Engine ----------

  /** Eksekusi manual sebuah automation (tanpa menunggu jadwal). */
  async runNow(userId: string, id: string) {
    const automation = await this.prisma.automation.findFirst({
      where: { id, home: { ownerId: userId } },
      include: { actions: true },
    });
    if (!automation) throw new NotFoundException('Automation tidak ditemukan.');

    const results = await this.executeActions(automation);
    return { automationId: automation.id, executed: results.length, results };
  }

  private async tick(): Promise<void> {
    try {
      const now = this.formatNow();
      // Cegah double-run: satu menit dievaluasi maksimal sekali per tick.
      if (this.lastFiredMinute === now) return;
      this.lastFiredMinute = now;

      const automations = await this.prisma.automation.findMany({
        where: {
          enabled: true,
          triggers: { some: { type: AutomationTriggerType.SCHEDULE } },
        },
        include: { triggers: true, actions: true },
      });

      for (const automation of automations) {
        const matched = automation.triggers.some(
          (t) =>
            t.type === AutomationTriggerType.SCHEDULE &&
            (t.config as ScheduleConfig).time === now,
        );
        if (!matched) continue;
        await this.executeActions(automation);
      }
    } catch (err) {
      this.logger.error(`Automation tick gagal: ${(err as Error).message}`);
    }
  }

  private async executeActions(
    automation: AutomationRecord,
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const actionRow of automation.actions) {
      if (!actionRow.deviceId) continue;

      const device = await this.prisma.device.findFirst({
        where: { id: actionRow.deviceId, homeId: automation.homeId },
      });
      if (!device) {
        this.logger.warn(
          `Perangkat "${actionRow.deviceId}" tidak ditemukan untuk automation "${automation.id}".`,
        );
        continue;
      }

      const payload = (actionRow.action ?? {}) as ActionPayload;
      if (!payload.action) continue;

      try {
        const result = await this.deviceCore.executeCommand(
          device,
          payload.action,
          payload.value,
        );
        results.push(result);
      } catch (err) {
        this.logger.error(
          `Gagal mengeksekusi action "${payload.action}" pada perangkat "${device.name}": ${(err as Error).message}`,
        );
      }
    }

    return results;
  }

  private formatNow(): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private async assertHomeOwned(userId: string, homeId: string) {
    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ownerId: userId },
    });
    if (!home) throw new NotFoundException('Home tidak ditemukan.');
    return home;
  }

  private async assertAutomationOwned(userId: string, id: string) {
    const automation = await this.prisma.automation.findFirst({
      where: { id, home: { ownerId: userId } },
    });
    if (!automation) throw new NotFoundException('Automation tidak ditemukan.');
    return automation;
  }
}
