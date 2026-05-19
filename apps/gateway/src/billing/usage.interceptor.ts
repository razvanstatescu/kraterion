import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { Observable, tap, catchError, throwError } from "rxjs";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { METER_CLASS_KEY, type MeterClass } from "./meter-class.decorator.js";

/**
 * Global S3-route interceptor that writes one `UsageEvent` row per
 * authenticated gateway request and increments the matching Redis
 * counter (`usage:{project}:{day_utc}:{class_a|class_b|egress}`).
 *
 * Two source-of-truth sinks intentionally:
 *
 *   - `UsageEvent` (day-partitioned, 35-day TTL planned) — the durable
 *     log, used by reconciliation against Stripe Meter Event Summary.
 *   - Redis day-counters — the hot path the hourly rollup worker reads
 *     for emitting `MeterEvent` rows without scanning per-request rows.
 *
 * Behaviour:
 *
 *   - Skips when no `@MeterClass*()` decorator is set on the handler.
 *     Forces every billable controller method to opt in explicitly; an
 *     accidental new endpoint without a decorator is logged once and
 *     ignored (never silently billed).
 *   - Skips when `req.kraterion?.identity.projectId` is missing —
 *     unauthenticated requests (preflight, SigV4 failures, health) never
 *     hit Postgres or Redis.
 *   - Writes happen in the response-success path (`tap`), so failed
 *     requests (4xx/5xx thrown inside the handler) do NOT meter. Match
 *     Cloudflare R2 / AWS S3 billing convention: only successful ops
 *     are billed.
 *   - Egress meter (`gateway_egress_bytes`) is captured only for class
 *     B requests; class A doesn't have meaningful egress (PUT responses
 *     are tiny acks, not data).
 *
 * Fire-and-forget: the postgres + redis writes run inside a `void`
 * promise after the response is sent. We never block the response on
 * billing IO; any failure logs and moves on. The reconciliation cron
 * catches drift later.
 *
 * Eventually the Postgres row writes will move behind an in-memory
 * batcher (1k events / 5s) — for now a one-row-per-request insert is
 * fine for the dogfood loop.
 */
@Injectable()
export class UsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UsageInterceptor.name);
  private warnedUntagged = new Set<string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meterClass = this.reflector.get<MeterClass | undefined>(
      METER_CLASS_KEY,
      ctx.getHandler(),
    );
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const reply = ctx.switchToHttp().getResponse<FastifyReply>();

    if (!meterClass) {
      // Untagged handlers — typically /health, OAuth, internal admin —
      // skip silently. Warn ONCE per handler so a missed decorator on a
      // billable route is obvious in dev.
      const tag = `${ctx.getClass().name}.${ctx.getHandler().name}`;
      if (!this.warnedUntagged.has(tag) && req.url?.startsWith("/")) {
        // Only warn for S3-shaped routes (not /health etc.).
        if (looksBillable(req)) {
          this.logger.warn(`untagged handler ${tag} on ${req.method} ${req.url}`);
          this.warnedUntagged.add(tag);
        }
      }
      return next.handle();
    }

    if (meterClass === "none") {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response: unknown) => {
        // Fire-and-forget the metering. Don't await — billing must
        // never block the response.
        void this.record(req, reply, meterClass, response).catch((err: unknown) => {
          this.logger.error(
            `UsageInterceptor record failed (${req.method} ${req.url}): ${(err as Error).message}`,
          );
        });
      }),
      // 4xx/5xx thrown inside the handler short-circuit `tap` — exactly
      // what we want (failures don't bill). Pass the error through so
      // the S3 exception filter can format it.
      catchError((err) => throwError(() => err)),
    );
  }

  private async record(
    req: FastifyRequest,
    reply: FastifyReply,
    meterClass: Exclude<MeterClass, "none">,
    response: unknown,
  ): Promise<void> {
    const projectId = req.kraterion?.identity.projectId;
    if (!projectId) return;
    const bucketName = req.kraterion?.bucket ?? null;

    const bytesIn = readBytesIn(req);
    const bytesOut = readBytesOut(reply, response);
    const kind = classifyKind(req.method, meterClass);
    const dayUtc = todayUtcKey();

    // Bucket FK — UsageEvent.bucket_id is optional and we don't always
    // know the row id (LIST root has no bucket). Look it up only when
    // present and cheap. For B1 we skip the lookup and store the name
    // pattern-style via null; bucket-level drill-downs come in B4.
    const bucketId: string | null = bucketName
      ? await this.lookupBucketId(projectId, bucketName)
      : null;

    await Promise.all([
      this.prisma.usageEvent.create({
        data: {
          project_id: projectId,
          bucket_id: bucketId,
          kind,
          bytes_in: bytesIn,
          bytes_out: bytesOut,
        },
      }),
      this.bumpRedis(projectId, dayUtc, meterClass, bytesOut),
    ]);
  }

  private async lookupBucketId(
    projectId: string,
    bucketName: string,
  ): Promise<string | null> {
    // Tiny cache window — bucket names are stable per project so the
    // gateway's existing per-request resolves already happened. We
    // still re-look up here because the interceptor doesn't share
    // state with the controller; opportunistic, falls back to null on
    // miss.
    const row = await this.prisma.bucket.findFirst({
      where: { project_id: projectId, name: bucketName, deleted_at: null },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async bumpRedis(
    projectId: string,
    dayUtc: string,
    meterClass: Exclude<MeterClass, "none">,
    bytesOut: number,
  ): Promise<void> {
    const pipe = this.redis.pipeline();
    const classKey =
      meterClass === "A" ? "class_a" : "class_b";
    const ttlSeconds = 60 * 60 * 24 * 40; // 40 days — past month + cycle boundary

    pipe.incr(`usage:${projectId}:${dayUtc}:${classKey}`);
    pipe.expire(`usage:${projectId}:${dayUtc}:${classKey}`, ttlSeconds);
    if (meterClass === "B" && bytesOut > 0) {
      pipe.incrby(`usage:${projectId}:${dayUtc}:egress`, bytesOut);
      pipe.expire(`usage:${projectId}:${dayUtc}:egress`, ttlSeconds);
    }
    await pipe.exec();
  }
}

/** Heuristic for whether an untagged handler looks like a billable
 *  S3 route — used only to gate the "missing decorator" warning. */
function looksBillable(req: FastifyRequest): boolean {
  if (!req.url) return false;
  if (req.url.startsWith("/health")) return false;
  if (req.method === "OPTIONS") return false;
  return true;
}

function classifyKind(
  method: string | undefined,
  meterClass: Exclude<MeterClass, "none">,
): string {
  if (meterClass === "B") {
    return method === "HEAD" ? "HEAD" : "GET";
  }
  switch (method) {
    case "PUT":
      return "PUT";
    case "DELETE":
      return "DELETE";
    case "POST":
      return "POST";
    case "GET":
      return "LIST"; // class A + GET = bucket-level list
    default:
      return method ?? "UNKNOWN";
  }
}

/** Bytes coming up from the client — `content-length` on PUTs is
 *  accurate enough for billing. `Buffer.byteLength(req.body)` would be
 *  more precise but the body has already been consumed by the time the
 *  interceptor's tap fires. */
function readBytesIn(req: FastifyRequest): number {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const cl = headers["content-length"];
  const v = Array.isArray(cl) ? cl[0] : cl;
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Bytes going out. Try the response header first (gateway sets
 *  `content-length` on every typed response). Falls back to estimating
 *  from the response body when present. */
function readBytesOut(reply: FastifyReply, response: unknown): number {
  const headers = reply.getHeaders() as Record<string, unknown>;
  const cl = headers["content-length"];
  const raw =
    typeof cl === "string" ? cl : typeof cl === "number" ? String(cl) : null;
  const fromHeader = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
  if (Buffer.isBuffer(response)) return response.byteLength;
  if (typeof response === "string") return Buffer.byteLength(response);
  return 0;
}

function todayUtcKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
