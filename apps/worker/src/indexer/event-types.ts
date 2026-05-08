/**
 * Zod schemas for the JSON payloads inside Sui events emitted by the
 * Kraterion package. Sourced from `move/kraterion/sources/events.move`.
 *
 * Conventions:
 *   - Sui u8/u32 arrive as JSON numbers; u64/u256 arrive as decimal
 *     strings (`google.protobuf.Value` doesn't have native bigints).
 *   - `vector<u8>` arrives as a base64 string.
 *   - `ID` and `address` arrive as `0x...` hex strings.
 *   - All schemas use `.passthrough()` so a Move upgrade that adds a
 *     field doesn't break the indexer (the payload is also archived
 *     raw in `event_payload jsonb`).
 *   - Numeric helpers (`u64Str`, `u32`) coerce uniformly so handlers
 *     don't repeat parse logic.
 */

import { z } from "zod";

// === Primitive coercions ===

/** Sui ID / address — `0x` + 64 hex chars (or shorter; gateway logs both). */
const suiId = z.string().regex(/^0x[0-9a-f]+$/i, "expected 0x-prefixed hex");

/** u64 / u128 / u256 arrive as decimal strings; coerce to bigint. */
const u64Str = z
  .string()
  .regex(/^\d+$/, "expected non-negative integer string")
  .transform((s) => BigInt(s));

/** u32 arrives as a JSON number. Coerce to plain number. */
const u32 = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]);

/** u8 arrives as a JSON number. */
const u8 = z.union([
  z.number().int().min(0).max(255),
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(255)),
]);

/** vector<u8> arrives as base64. Decode to Buffer for downstream use. */
const bytesB64 = z
  .string()
  .transform((s, ctx) => {
    try {
      return Buffer.from(s, "base64");
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid base64" });
      return z.NEVER;
    }
  });

// === Event schemas (one per Move event struct) ===

export const KraterionBucketCreatedSchema = z
  .object({
    bucket_id: suiId,
    owner: suiId,
    name: bytesB64,
    encryption_mode: u8,
  })
  .passthrough();
export type KraterionBucketCreated = z.infer<typeof KraterionBucketCreatedSchema>;

export const KraterionObjectCreatedSchema = z
  .object({
    bucket_id: suiId,
    walrus_blob_object_id: suiId,
    walrus_blob_id: u64Str, // u256 on chain; arrives as decimal string
    s3_key: bytesB64,
    content_type: bytesB64,
    owner_address: suiId,
    wrapped_by: suiId,
    seal_identity: bytesB64,
    size_bytes: u64Str,
    storage_end_epoch: u32,
    // 16-byte raw MD5 of the plaintext body. Hex-encoded by the
    // handler for `S3Object.etag` (which the gateway returns in the
    // `ETag:` header).
    etag_md5: bytesB64,
  })
  .passthrough();
export type KraterionObjectCreated = z.infer<typeof KraterionObjectCreatedSchema>;

export const KraterionObjectExtendedSchema = z
  .object({
    shared_blob_id: suiId,
    epochs_added: u32,
    funder: suiId,
  })
  .passthrough();
export type KraterionObjectExtended = z.infer<typeof KraterionObjectExtendedSchema>;

export const ApiAccessGrantedSchema = z
  .object({ bucket_id: suiId, owner: suiId, granted_to: suiId })
  .passthrough();
export type ApiAccessGranted = z.infer<typeof ApiAccessGrantedSchema>;

export const ApiAccessRevokedSchema = z
  .object({ bucket_id: suiId, owner: suiId })
  .passthrough();
export type ApiAccessRevoked = z.infer<typeof ApiAccessRevokedSchema>;

export const BucketVisibilityChangedSchema = z
  .object({
    bucket_id: suiId,
    owner: suiId,
    old_mode: u8,
    new_mode: u8,
  })
  .passthrough();
export type BucketVisibilityChanged = z.infer<typeof BucketVisibilityChangedSchema>;

// === Encryption-mode mapping ===
// Mirrors `move/kraterion/sources/kraterion.move` constants:
//   ENCRYPTION_MODE_PRIVATE = 0
//   ENCRYPTION_MODE_PUBLIC  = 1
// The DB stores them as the human strings the rest of the app uses.
export function encryptionModeToString(mode: number): "private" | "public-read" {
  switch (mode) {
    case 0:
      return "private";
    case 1:
      return "public-read";
    default:
      throw new Error(`unknown encryption_mode: ${mode}`);
  }
}
