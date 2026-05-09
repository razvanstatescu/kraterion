import { Controller, Get, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  liveness() {
    return { service: "control-plane", status: "ok" };
  }

  /**
   * Readiness probe: round-trip a `SELECT 1` so callers know the DB pool
   * is healthy. Returns 503 on failure (Nest will re-throw through the
   * global filter as the standard JSON envelope).
   */
  @Get("ready")
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { service: "control-plane", status: "ready" };
    } catch (err) {
      this.logger.error(`readiness DB ping failed: ${(err as Error).message}`);
      throw new HttpException("database unavailable", HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
