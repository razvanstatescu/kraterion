import "reflect-metadata";
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
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
