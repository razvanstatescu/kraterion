/**
 * Helpers for reading the SigV4-resolved request context off a Fastify
 * request — central spot so each controller doesn't reimplement the
 * "is `req.kraterion` populated?" check.
 *
 * The `Sigv4Guard` populates `req.kraterion` before any controller
 * handler runs; if it's missing, something has gone very wrong (route
 * ordering bug, guard not applied) and the InternalError surface is
 * the right escape hatch.
 */

import type { FastifyRequest } from "fastify";
import { S3Error } from "./s3-error.js";
import type { KraterionRequestContext } from "../auth/sigv4/types.js";

export function requireKraterion(req: FastifyRequest): KraterionRequestContext {
  const ctx = req.kraterion;
  if (!ctx) {
    throw new S3Error("InternalError", "Request context not initialized.");
  }
  return ctx;
}

export function requireBucket(ctx: KraterionRequestContext): string {
  if (!ctx.bucket) {
    throw new S3Error("InvalidRequest", "Bucket name is required.");
  }
  return ctx.bucket;
}

export function requireKey(ctx: KraterionRequestContext): string {
  if (!ctx.key) {
    throw new S3Error("InvalidRequest", "Object key is required.");
  }
  return ctx.key;
}
