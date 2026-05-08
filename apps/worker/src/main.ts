import "reflect-metadata";
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { metricsRegistry } from "./indexer/metrics.js";

/**
 * The worker process is a Nest app with a tiny Fastify front for liveness
 * + Prometheus scraping. The actual work — gRPC checkpoint streaming +
 * event handling — runs inside `IndexerService` driven by Nest's
 * `OnApplicationBootstrap` lifecycle hook.
 *
 * Why Fastify here even though it's just two routes: keeps the worker
 * symmetric with the gateway (same logging, same shutdown semantics,
 * same `app.enableShutdownHooks()`), and `prom-client`'s recommended
 * scrape pattern needs an HTTP endpoint. Two routes, ~30 LoC of
 * adapter; cheap.
 */
async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Worker doesn't accept user bodies — keep the limit tight.
      bodyLimit: 64 * 1024,
      trustProxy: process.env["TRUST_PROXY"] === "true",
    }),
  );

  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();
  // Prometheus scrape endpoint. Standard text format; the `prom-client`
  // global registry is shared with `metrics.ts`.
  fastify.get("/metrics", async (_req, reply) => {
    void reply
      .header("Content-Type", metricsRegistry.contentType)
      .send(await metricsRegistry.metrics());
  });

  const port = Number(process.env["PORT"] ?? 4003);
  await app.listen(port, "0.0.0.0");
  logger.log(`Worker listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[bootstrap] fatal", err);
  process.exit(1);
});
