import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from "@nestjs/common";
import type { Redis } from "ioredis";
import { PrismaService } from "./prisma/prisma.service.js";
import { REDIS } from "./redis/redis.module.js";

interface CheckOk { status: "ok"; latencyMs: number }
interface CheckFail { status: "fail"; error: string }
type Check = CheckOk | CheckFail;

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Liveness — process is up. Always 200, no I/O.
   */
  @Get()
  liveness() {
    return { service: "gateway", status: "ok" };
  }

  /**
   * Readiness — process is up AND its hard deps (Postgres, Redis) are
   * reachable. 200 if both green; 503 if either fails. Use this for
   * orchestrator-side readiness gates / load-balancer health checks.
   */
  @Get("ready")
  async readiness() {
    const [db, cache] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const allOk = db.status === "ok" && cache.status === "ok";
    const body = { service: "gateway", status: allOk ? "ok" : "degraded", db, redis: cache };
    if (!allOk) {
      this.logger.warn(`readiness degraded: db=${db.status} redis=${cache.status}`);
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  private async checkDb(): Promise<Check> {
    const t0 = Date.now();
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      return { status: "ok", latencyMs: Date.now() - t0 };
    } catch (err) {
      return { status: "fail", error: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<Check> {
    const t0 = Date.now();
    try {
      const pong = await this.redis.ping();
      if (pong !== "PONG") return { status: "fail", error: `unexpected response: ${pong}` };
      return { status: "ok", latencyMs: Date.now() - t0 };
    } catch (err) {
      return { status: "fail", error: (err as Error).message };
    }
  }
}
