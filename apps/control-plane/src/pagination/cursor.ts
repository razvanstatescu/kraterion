import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * Opaque base64url-encoded cursor: `base64url(JSON({ v: 1, after: <id> }))`.
 *
 * Mirrors the gateway's S3 ListObjectsV2 cursor shape (see
 * `docs/decisions.md` "ListObjectsV2: opaque-versioned continuation tokens").
 * We don't need the `kind` discriminant here — the control plane never
 * collapses entries into common-prefix buckets — so the payload is the
 * minimal `{ v, after }`.
 *
 * `v: 1` is reserved so we can evolve the format without breaking existing
 * tokens; future versions just add a new tag.
 */
export interface CursorPayload {
  v: 1;
  /** Last id from the previous page; the next page starts at the row after this. */
  after: string;
}

const VERSION = 1;

export function encodeCursor(after: string): string {
  const payload: CursorPayload = { v: VERSION, after };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(token: string): CursorPayload {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new ControlPlaneError("InvalidArgument", "The cursor provided is malformed", {
      cursor: token,
    });
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    (decoded as { v?: unknown }).v !== VERSION ||
    typeof (decoded as { after?: unknown }).after !== "string"
  ) {
    throw new ControlPlaneError("InvalidArgument", "The cursor provided is malformed", {
      cursor: token,
    });
  }
  return decoded as CursorPayload;
}
