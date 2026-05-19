import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Hourly snapshot of `StoragePool.used_encoded_bytes` per project,
 * written to `UsageDaily` for the dashboard's "used / reserved"
 * gauge. **No `MeterEvent` is emitted — storage is a licensed
 * subscription line item billed on `quantity`, not metered.**
 *
 * We aggregate via a running average per day:
 *
 *     new_avg = (existing_value * existing_samples + sample) / (existing_samples + 1)
 *
 * But for v1 we just store the latest sample per (project, day):
 *  the storage gauge only needs the most-recent figure, not a true
 *  hour-integrated mean. The byte-second math that would matter for
 *  billing was retired with the move to the licensed model.
 *
 * Cadence: 10-minute tick (matches the request-rollup processor —
 * fewer timers in CP). Boot-time first tick.
 */
@Injectable()
export class StorageUsageProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageUsageProcessor.name);
  private readonly TICK_MS = 10 * 60 * 1000;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(`storage-usage armed (tick=${this.TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ projects: number }> {
    const day = todayUtcKey();
    const pools = await this.prisma.storagePool.findMany({
      where: { status: "active" },
      select: {
        project_id: true,
        used_encoded_bytes: true,
        reserved_encoded_bytes: true,
      },
    });
    for (const pool of pools) {
      await this.prisma.usageDaily.upsert({
        where: {
          project_id_day_meter_name: {
            project_id: pool.project_id,
            day,
            meter_name: "storage_used_bytes",
          },
        },
        create: {
          project_id: pool.project_id,
          day,
          meter_name: "storage_used_bytes",
          value: pool.used_encoded_bytes,
        },
        update: {
          // Latest-sample-wins: storage gauge is point-in-time.
          value: pool.used_encoded_bytes,
        },
      });
      await this.prisma.usageDaily.upsert({
        where: {
          project_id_day_meter_name: {
            project_id: pool.project_id,
            day,
            meter_name: "storage_reserved_bytes",
          },
        },
        create: {
          project_id: pool.project_id,
          day,
          meter_name: "storage_reserved_bytes",
          value: pool.reserved_encoded_bytes,
        },
        update: { value: pool.reserved_encoded_bytes },
      });
    }
    return { projects: pools.length };
  }
}

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
