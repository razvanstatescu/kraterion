import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return { service: "worker", status: "ok" };
  }

  @Get("ready")
  async ready() {
    const t0 = Date.now();
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      return { service: "worker", status: "ok", db: { status: "ok", latencyMs: Date.now() - t0 } };
    } catch (err) {
      return {
        service: "worker",
        status: "degraded",
        db: { status: "fail", error: (err as Error).message },
      };
    }
  }
}
