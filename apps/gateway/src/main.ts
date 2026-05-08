import "reflect-metadata";
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { S3ExceptionFilter } from "./s3/s3-error.filter.js";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // 13 GiB body limit — Walrus's per-blob ceiling.
      bodyLimit: 13 * 1024 * 1024 * 1024,
      // Trust the X-Forwarded-* headers when we eventually sit behind a
      // load balancer; off in dev (no LB).
      trustProxy: process.env["TRUST_PROXY"] === "true",
    }),
  );

  // Wires SIGTERM/SIGINT into Nest's lifecycle (`OnModuleDestroy`),
  // which is how PrismaService and RedisModule get clean disconnects
  // on container stop. Required since Prisma 5 dropped its own
  // `enableShutdownHooks` helper.
  app.enableShutdownHooks();

  // Global S3 XML error filter — converts every thrown error (incl.
  // `S3Error`, plain `HttpException`, and unhandled exceptions) into
  // the canonical AWS error response shape boto3 expects.
  app.useGlobalFilters(new S3ExceptionFilter());

  const port = Number(process.env["PORT"] ?? 4002);
  await app.listen(port, "0.0.0.0");
  logger.log(`Gateway listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[bootstrap] fatal", err);
  process.exit(1);
});
