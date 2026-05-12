/**
 * Typed fetch wrapper around the control plane.
 *
 * Attaches the Bearer session JWT from `localStorage['kraterion.cp_session']`
 * (set in Phase B by `lib/auth.ts`) and parses the JSON error envelope
 * `{ error: { code, message, requestId, details? } }` into a typed
 * `ControlPlaneError`. The error-code union mirrors the backend's
 * `ControlPlaneErrorCode` at `apps/control-plane/src/errors/control-plane-error.ts`.
 *
 * On 401 we wipe the local session — the caller's UI bounces back to /login
 * via `RequireAuth`.
 */

import { env } from "./env";

export type ControlPlaneErrorCode =
  | "InvalidArgument"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "RateLimited"
  | "InternalError";

export class ControlPlaneError extends Error {
  constructor(
    public readonly code: ControlPlaneErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

const SESSION_KEY = "kraterion.cp_session";

interface StoredSession {
  token: string;
  accountId: string;
  suiAddress: string;
  email: string;
}

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function clearSession() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Bearer header — sign-in endpoints don't need auth. */
  unauthenticated?: boolean;
  /** Custom AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export async function cpFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  // Only set Content-Type when there's actually a JSON body. Fastify's
  // body parser refuses an empty payload that advertises
  // `application/json` — the CP's parameterless POSTs (prepare-download,
  // prepare-revoke-all, etc.) used to fall through as "Unhandled
  // exception: Body cannot be empty…" and surfaced as a generic 500.
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!opts.unauthenticated) {
    const session = readSession();
    if (session) headers["Authorization"] = `Bearer ${session.token}`;
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  if (opts.signal) init.signal = opts.signal;

  const res = await fetch(`${env.controlPlaneUrl}${path}`, init);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const envelope = payload as
      | { error?: { code?: string; message?: string; requestId?: string; details?: Record<string, string> } }
      | undefined;
    const code = (envelope?.error?.code as ControlPlaneErrorCode) ?? "InternalError";
    const message = envelope?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) clearSession();
    throw new ControlPlaneError(
      code,
      message,
      res.status,
      envelope?.error?.details,
      envelope?.error?.requestId,
    );
  }

  return payload as T;
}

// === wire-format mirrors ====================================================
// These mirror the backend serializer outputs so the dashboard has typed
// access. Update both sides together if the wire shape ever changes.

export interface AccountJson {
  id: string;
  email: string;
  sui_address: string;
  status: "active" | "cancelled" | "suspended";
  created_at: string;
}

export interface ProjectJson {
  id: string;
  account_id: string;
  name: string;
  default_region: string;
  created_at: string;
}

export interface ApiKeyJson {
  id: string;
  project_id: string;
  name: string;
  access_key_id: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface BucketJson {
  id: string;
  project_id: string;
  name: string;
  region: string;
  encryption_mode: "private" | "public-read";
  kraterion_bucket_object_id: string;
  api_access_granted: boolean;
  funding_pool_wal: string;
  created_at: string;
  deleted_at: string | null;
}

export interface FolderMarkerJson {
  id: string;
  bucket_id: string;
  /** Full prefix from bucket root, always ends in "/". */
  prefix: string;
  created_at: string;
}

export interface S3ObjectJson {
  id: string;
  bucket_id: string;
  s3_key: string;
  size_bytes: string;
  content_type: string | null;
  etag: string;
  walrus_blob_id: string;
  shared_blob_object_id: string;
  storage_end_epoch: number;
  seal_identity_b64: string;
  /** User-provided `x-amz-meta-*` headers captured at PUT time. Empty
   *  object → null on the wire to keep the shape minimal. */
  metadata: Record<string, string> | null;
  uploaded_at: string;
  deleted_at: string | null;
}

export type ActivityEventKind =
  | "bucket_created"
  | "bucket_deleted"
  | "object_uploaded"
  | "object_deleted";

export interface ActivityEventJson {
  id: string;
  kind: ActivityEventKind;
  at: string;
  tx_digest: string | null;
  bucket: {
    id: string;
    name: string;
    encryption_mode: "private" | "public-read";
  };
  object: {
    id: string;
    s3_key: string;
    content_type: string | null;
    size_bytes: string;
  } | null;
}

export interface PrepareTxResponse {
  digest: string;
  bytes: string;
  expected: {
    package_id: string;
    function: string;
    summary: string;
    sender: string;
    allowed_move_call_targets: string[];
    sponsored_by: "enoki";
  };
}

export const sessionStorage = {
  key: SESSION_KEY,
  read: readSession,
  write(session: StoredSession) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  },
  clear: clearSession,
};
export type { StoredSession };
