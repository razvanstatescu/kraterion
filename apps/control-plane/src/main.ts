import "reflect-metadata";
import "dotenv/config";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { ControlPlaneExceptionFilter } from "./errors/exception.filter.js";
import { cpRequestsTotal, metricsRegistry } from "./metrics.js";

/**
 * Control-plane bootstrap. Symmetric with gateway/worker: Fastify adapter,
 * shutdown hooks, global JSON exception filter, /metrics endpoint.
 *
 * Body limit is 1 MiB — control plane only takes JSON for CRUD; large
 * blobs go to the gateway.
 */
async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 1 * 1024 * 1024,
      trustProxy: process.env["TRUST_PROXY"] === "true",
    }),
  );

  app.enableShutdownHooks();
  app.useGlobalFilters(new ControlPlaneExceptionFilter());

  // Helmet with NestJS-friendly defaults; CSP is off because the dashboard
  // (separate origin) doesn't need it and it would interfere with future
  // SDK consumers.
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });

  // CORS allowlist — defaults to localhost dashboard. Multiple origins via
  // comma-separated env (`CORS_ORIGINS=https://a,https://b`).
  const corsOrigins = (process.env["CORS_ORIGINS"] ?? process.env["DASHBOARD_ORIGIN"] ?? "http://localhost:3001")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await app.register(fastifyCors, {
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  const fastify = app.getHttpAdapter().getInstance();

  // Per-response counter — labels routerPath when Fastify resolved one,
  // else "unmatched". Cheap and gives us an immediate view of traffic
  // shape without per-controller wiring.
  fastify.addHook("onResponse", (req, reply, done) => {
    const route = (req as unknown as { routerPath?: string }).routerPath ?? "unmatched";
    cpRequestsTotal.inc({ route, method: req.method, status: String(reply.statusCode) });
    done();
  });

  fastify.get("/metrics", async (_req, reply) => {
    void reply
      .header("Content-Type", metricsRegistry.contentType)
      .send(await metricsRegistry.metrics());
  });

  const port = Number(process.env["PORT"] ?? 4001);
  await app.listen(port, "0.0.0.0");
  logger.log(`Control plane listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[bootstrap] fatal", err);
  process.exit(1);
});
