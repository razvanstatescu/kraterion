/**
 * Nest Guard that runs SigV4 verification + URL-style parsing on every
 * S3 route. Throws `S3Error` on rejection (the global filter renders
 * the canonical XML response).
 *
 * Why a Guard, not a Middleware: in Fastify mode Nest's middleware
 * receives Node's raw req/res, which doesn't have the typed Fastify
 * augmentations we want for `req.kraterion`. A Guard's
 * `ExecutionContext` exposes the actual `FastifyRequest`.
 *
 * Apply per-controller via `@UseGuards(Sigv4Guard)` (we'll do this on
 * the S3 controllers in Phase 3c). Keeps `/health*` unprotected.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Sigv4VerificationService } from "./sigv4.service.js";
import { parseUrlStyle } from "../../s3/url-style.js";
import type { KraterionRequestContext } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    kraterion?: KraterionRequestContext;
  }
}

@Injectable()
export class Sigv4Guard implements CanActivate {
  private readonly logger = new Logger(Sigv4Guard.name);

  constructor(private readonly verifier: Sigv4VerificationService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const headers = lowercaseHeaders(req.headers);
    const url = req.url ?? "/";
    const [path, rawQuery] = splitUrl(url);

    const identity = await this.verifier.verify({
      method: req.method ?? "GET",
      path,
      rawQuery,
      headers,
    });

    const host = headers["host"] ?? "";
    const parsed = parseUrlStyle(host, path);
    req.kraterion = {
      identity,
      ...(parsed.bucket !== undefined && { bucket: parsed.bucket }),
      ...(parsed.key !== undefined && { key: parsed.key }),
    };
    return true;
  }
}

function lowercaseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(headers)) {
    const v = headers[k];
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v[0] ?? "" : v;
  }
  return out;
}

function splitUrl(url: string): [string, string] {
  const q = url.indexOf("?");
  if (q === -1) return [url, ""];
  return [url.slice(0, q), url.slice(q + 1)];
}
