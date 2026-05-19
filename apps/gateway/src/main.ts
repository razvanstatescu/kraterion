import "reflect-metadata";
import "dotenv/config";
import fastifyCors from "@fastify/cors";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { UsageInterceptor } from "./billing/usage.interceptor.js";
import { S3ExceptionFilter } from "./s3/s3-error.filter.js";

// 2 GiB hard ceiling on body size. AES-GCM auth-tag-at-end means we
// must buffer ciphertext + plaintext in RAM during decrypt, and Seal's
// `client.encrypt(...)` is single-shot too — so we can't accept a body
// larger than what fits comfortably in RAM. Walrus's per-blob cap is
// 13 GiB, but we'll only get there once chunked-frame Seal envelopes
// land (post-hackathon). The +1 MiB margin lets us detect overage at
// the controller and return canonical `EntityTooLarge` XML.
const MAX_BODY_BYTES = 2 * 1024 * 1024 * 1024 + 1024 * 1024;

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: MAX_BODY_BYTES,
      // Trust the X-Forwarded-* headers when we eventually sit behind a
      // load balancer; off in dev (no LB).
      trustProxy: process.env["TRUST_PROXY"] === "true",
    }),
  );

  // S3 PutObject sends raw bytes that the controller hashes byte-exact
  // for ETag (MD5) and SigV4 sha256 verification. Fastify's built-in
  // `text/plain` parser stringifies the body — that breaks both the
  // hash math (UTF-8 round-trip can mutate bytes) and binary uploads.
  // Remove the defaults and register a single catch-all that buffers
  // every Content-Type into `req.body: Buffer`; controllers read it
  // via `@Body() body: Buffer`. We have no S3 endpoint that accepts
  // JSON bodies, so removing the JSON parser is safe (health endpoints
  // are GET-only).
  const fastify = app.getHttpAdapter().getInstance();
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: MAX_BODY_BYTES },
    (_req, body, done) => done(null, body),
  );

  // CORS — boto3 / aws-cli / rclone don't need it (they're not browsers),
  // but the dashboard does for direct presigned uploads / downloads.
  // Allowlist via `DASHBOARD_ORIGIN` (defaults to the dev port). The
  // SigV4 header set (`Authorization`, `X-Amz-*`, `Content-Type`) plus
  // the response headers the dashboard needs to read (ETag, Content-Type,
  // Content-Length, Last-Modified) are exposed explicitly.
  const corsOrigins = (process.env["CORS_ORIGINS"] ?? process.env["DASHBOARD_ORIGIN"] ?? "http://localhost:3001")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await fastify.register(fastifyCors, {
    origin: corsOrigins,
    credentials: false,
    methods: ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Amz-Date",
      "X-Amz-Content-Sha256",
      "X-Amz-Security-Token",
      "X-Amz-User-Agent",
    ],
    exposedHeaders: ["ETag", "Content-Type", "Content-Length", "Last-Modified", "x-amz-request-id"],
  });

  // Wires SIGTERM/SIGINT into Nest's lifecycle (`OnModuleDestroy`),
  // which is how PrismaService and RedisModule get clean disconnects
  // on container stop. Required since Prisma 5 dropped its own
  // `enableShutdownHooks` helper.
  app.enableShutdownHooks();

  // Global S3 XML error filter — converts every thrown error (incl.
  // `S3Error`, plain `HttpException`, and unhandled exceptions) into
  // the canonical AWS error response shape boto3 expects.
  app.useGlobalFilters(new S3ExceptionFilter());

  // Billing wire-up (B1 scaffold). The interceptor records every
  // SigV4-authenticated S3 call into `UsageEvent` + Redis day-counters.
  // The two guards (`SpendCapGuard`, `PoolCapacityGuard`) are attached
  // controller-level alongside `Sigv4Guard` so they run AFTER auth
  // populates `req.kraterion`. Resolve from the Nest DI container so
  // the interceptor picks up Prisma + Redis without manual wiring.
  app.useGlobalInterceptors(app.get(UsageInterceptor));

  const port = Number(process.env["PORT"] ?? 4002);
  await app.listen(port, "0.0.0.0");
  logger.log(`Gateway listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[bootstrap] fatal", err);
  process.exit(1);
});
