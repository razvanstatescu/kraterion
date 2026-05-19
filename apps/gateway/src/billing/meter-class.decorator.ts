import { SetMetadata } from "@nestjs/common";

/**
 * Per-handler tag for which Stripe metered class an S3 endpoint
 * belongs to:
 *   - `'A'`  → PUT, POST, LIST, DELETE — billed at $5/M ops
 *   - `'B'`  → GET, HEAD            — billed at $0.40/M ops
 *   - `'none'` → not billed (health, OPTIONS, system endpoints)
 *
 * The `UsageInterceptor` reads this with `Reflector.get(...)` to pick
 * the right Redis counter / `UsageEvent.kind` per request. Classifying
 * by HTTP method alone is ambiguous (LIST and GetObject are both
 * `GET`); the explicit decorator keeps it unambiguous.
 */
export type MeterClass = "A" | "B" | "none";

export const METER_CLASS_KEY = "kraterion:meterClass";

export const MeterClassA = () => SetMetadata(METER_CLASS_KEY, "A" as const);
export const MeterClassB = () => SetMetadata(METER_CLASS_KEY, "B" as const);
export const MeterClassNone = () => SetMetadata(METER_CLASS_KEY, "none" as const);
