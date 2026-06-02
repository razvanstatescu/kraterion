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

// === Storage pool migration events (Phase H) ===
//
// `KraterionObjectCreated` + `KraterionObjectExtended` were the SharedBlob-
// era events; their handlers were deleted in Phase D. The pool model emits
// six new events below — all wrapped by our `pool_vault.move` module so
// we don't have to filter Walrus's network-wide events.

export const KraterionVaultCreatedSchema = z
  .object({
    vault_id: suiId,
    pool_id: suiId,
    created_by: suiId,
    /// Off-chain Postgres `Project.id` UUID, passed by the gateway at
    /// `create_vault` time. Decoded from base64 → UTF-8 by the handler.
    project_id: bytesB64,
    reserved_encoded_capacity_bytes: u64Str,
    start_epoch: u32,
    end_epoch: u32,
  })
  .passthrough();
export type KraterionVaultCreated = z.infer<typeof KraterionVaultCreatedSchema>;

export const KraterionVaultRevokedSchema = z
  .object({
    vault_id: suiId,
    revoked_by: suiId,
  })
  .passthrough();
export type KraterionVaultRevoked = z.infer<typeof KraterionVaultRevokedSchema>;

export const KraterionPooledBlobRegisteredSchema = z
  .object({
    vault_id: suiId,
    pooled_blob_object_id: suiId,
    walrus_blob_id: u64Str, // u256 on chain
    s3_key: bytesB64,
    content_type: bytesB64,
    owner_address: suiId,
    registered_by: suiId,
    /// `bucket_uid (32) || object_uuid (16)` = 48 bytes. The first 32
    /// bytes are the on-chain bucket object ID (used by the handler to
    /// resolve the S3Object's parent bucket without an extra event field).
    seal_identity: bytesB64,
    size_bytes: u64Str,
    /// 16-byte raw MD5 of the plaintext body. Hex-encoded by the
    /// handler for `S3Object.etag` (S3 API contract).
    etag_md5: bytesB64,
  })
  .passthrough();
export type KraterionPooledBlobRegistered = z.infer<typeof KraterionPooledBlobRegisteredSchema>;

export const KraterionPooledBlobCertifiedSchema = z
  .object({
    vault_id: suiId,
    pooled_blob_object_id: suiId,
    walrus_blob_id: u64Str,
    certified_by: suiId,
  })
  .passthrough();
export type KraterionPooledBlobCertified = z.infer<typeof KraterionPooledBlobCertifiedSchema>;

export const KraterionPooledBlobDeletedSchema = z
  .object({
    vault_id: suiId,
    pooled_blob_object_id: suiId,
    walrus_blob_id: u64Str,
    deleted_by: suiId,
  })
  .passthrough();
export type KraterionPooledBlobDeleted = z.infer<typeof KraterionPooledBlobDeletedSchema>;

export const KraterionPoolExtendedSchema = z
  .object({
    vault_id: suiId,
    extended_epochs: u32,
    new_end_epoch: u32,
    extended_by: suiId,
  })
  .passthrough();
export type KraterionPoolExtended = z.infer<typeof KraterionPoolExtendedSchema>;

export const KraterionPoolResizedGrowSchema = z
  .object({
    vault_id: suiId,
    additional_encoded_capacity_bytes: u64Str,
    new_reserved_encoded_capacity_bytes: u64Str,
    resized_by: suiId,
  })
  .passthrough();
export type KraterionPoolResizedGrow = z.infer<typeof KraterionPoolResizedGrowSchema>;

/// P9 — `KraterionSessionAnchored` emitted by `pool_vault::anchor_session`
/// in the same PTB as `register_blob`. Paired event: the
/// `KraterionPooledBlobRegistered` handler writes the PooledBlob row;
/// `SessionAnchoredHandler` then writes the AgentSessionTrace row
/// linking that PooledBlob to its parent AgentSession.
export const KraterionSessionAnchoredSchema = z
  .object({
    vault_id: suiId,
    pooled_blob_object_id: suiId,
    walrus_blob_id: u64Str,
    /// 48-byte Seal IBE identity: `bucket_uid (32) || session_uuid (16)`.
    seal_identity: bytesB64,
    /// 32-byte SHA-256 of the canonical-JSON plaintext trace.
    trace_hash: bytesB64,
    /// 16-byte AgentSession UUID raw bytes. Decoded in the handler to
    /// look up the parent session row.
    session_id: bytesB64,
    /// 16-byte KraterionAgent UUID raw bytes. Recorded on the trace row
    /// for fast filtering.
    agent_id: bytesB64,
    invocation_count: u32,
    anchored_by: suiId,
  })
  .passthrough();
export type KraterionSessionAnchored = z.infer<typeof KraterionSessionAnchoredSchema>;

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
