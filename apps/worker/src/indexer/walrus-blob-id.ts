/**
 * Walrus blob ID encoding helper.
 *
 * On chain a Walrus blob ID is a `u256`. Off-chain (HTTP aggregator,
 * SDK return values, our `S3Object.walrus_blob_id` column), it's a
 * URL-safe-base64 string of the little-endian 32 bytes.
 *
 * The gRPC event payload arrives via `google.protobuf.Value`, where
 * u256 doesn't fit in JS `number` — protobuf-ts encodes it as a
 * decimal string. We convert here for `S3Object.walrus_blob_id`.
 */

/** Convert a u256 (as bigint) to Walrus's URL-safe-base64 blob ID string. */
export function walrusBlobIdU256ToString(value: bigint): string {
  if (value < 0n) throw new Error(`walrus blob id must be non-negative; got ${value}`);
  const bytes = Buffer.alloc(32);
  let v = value;
  for (let i = 0; i < 32 && v > 0n; i++) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  // The walrus SDK uses URL-safe base64 with NO padding for blob IDs.
  return bytes.toString("base64url");
}
