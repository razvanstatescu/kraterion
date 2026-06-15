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
  | "PreconditionFailed"
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
const SESSION_EVENT = "kraterion:cp_session_change";

function emitSessionChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

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
    emitSessionChange();
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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
  /** "s3" (AKIA SigV4 keys) or "bearer" (kr_live_/kr_test_ tokens). */
  kind: "s3" | "bearer";
  // S3-only fields:
  access_key_id: string | null;
  // Bearer-only fields:
  token_prefix: string | null;
  network: "testnet" | "mainnet" | null;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface MintBearerResponse {
  api_key: ApiKeyJson;
  /** Cleartext token — shown to the user exactly once. */
  token: string;
  network: "testnet" | "mainnet";
  WARNING: string;
}

/**
 * Project-scoped AI provider credential. Wire shape omits the wrapped
 * ciphertext entirely — the dashboard only ever sees the masked
 * `key_last_4` once it's been stored.
 */
export type ProviderName = "openai";
export type ProviderCredentialStatus = "active" | "invalid" | "revoked";
export interface ProviderCredentialJson {
  provider: ProviderName;
  key_last_4: string;
  status: ProviderCredentialStatus;
  last_validated: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * P3 — First-class agents resource. Owned by a project, configured
 * with a system prompt + model + attached buckets, exposed at
 * `POST /v1/agents/:id/chat/completions` (OpenAI Chat Completions
 * wire format).
 */
export type AgentStatus = "active" | "revoked";
export interface AgentJson {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_k: number;
  status: AgentStatus;
  sub_wallet_address: string;
  bucket_ids: string[];
  /** Enabled built-in tool names (P4). Empty array = pure RAG, no
   *  tools fed to the model. */
  tools: string[];
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

/** Per-call tool audit row surfaced in the chat panel + activity feed. */
export interface AgentToolCallJson {
  tool_call_id: string;
  tool_name: string;
  status: "pending" | "completed" | "failed";
  round: number;
  arguments: unknown;
  output: string | null;
  output_json: unknown;
  tx_digest: string | null;
  walrus_blob_id: string | null;
  pooled_blob_object_id: string | null;
  error_detail: string | null;
  latency_ms: number | null;
}

/** Per-bucket on-chain grant status for an agent's sub-wallet. */
export interface AgentBucketGrantJson {
  bucket_id: string;
  bucket_name: string;
  granted_on_chain: boolean;
  kraterion_bucket_object_id: string;
}

/** P6 — Share token row returned by the agent share-tokens endpoints. */
export interface ShareTokenJson {
  id: string;
  agent_id: string;
  name: string;
  /** Cosmetic preview ("kr_share_test_aB3…X9Z"). Cleartext is shown
   *  only once at mint time and never returned again. */
  token_prefix: string;
  network: "testnet" | "mainnet";
  allowed_origins: string[];
  max_requests_per_day: number | null;
  /** Dollars, not micros — converted on the wire. */
  max_spend_usd_per_day: number | null;
  /** When false, the chat suppresses source citations + retrieval
   *  info on both the prompt and response side. */
  cite_sources: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface MintShareTokenResponse {
  share_token: ShareTokenJson;
  /** Cleartext token — shown to the user exactly once at mint. */
  token: string;
  network: "testnet" | "mainnet";
  WARNING: string;
}

/** Citation row attached to a chat completion response (kraterion ext). */
export interface AgentCitationJson {
  index: number;
  chunk_hash: string;
  s3_key: string;
  ordinal: number;
  bucket_id: string;
  source_walrus_blob_id: string;
  source_pooled_blob_object_id: string | null;
  manifest_walrus_blob_id: string | null;
  /** True when the assistant text actually referenced this chunk. */
  cited: boolean;
}

export interface BucketJson {
  id: string;
  project_id: string;
  name: string;
  region: string;
  encryption_mode: "private" | "public-read";
  kraterion_bucket_object_id: string;
  api_access_granted: boolean;
  /**
   * @deprecated Kraterion bills out-of-band; chain economics like WAL
   * funding pools no longer surface in the dashboard. Kept on the wire
   * for backward compatibility with older clients.
   */
  funding_pool_wal: string;
  created_at: string;
  deleted_at: string | null;
  /** CP join with KnowledgeBucketSettings; absent on older CP builds. */
  knowledge_enabled?: boolean;
  /** Non-deleted object count in this bucket. List + detail responses. */
  object_count?: number;
  /** Sum of `size_bytes` across non-deleted objects (BigInt as string). */
  size_bytes_total?: string;
  /** On-chain `KraterionBucket.owner`. Detail response only. */
  owner_address?: string;
  /** On-chain `api_decryption_addresses` vector. Detail response only. */
  api_decryption_addresses?: string[];
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
  /**
   * Sui object ID of the `walrus::storage_pool::PooledBlob` row inside
   * the project's pool. Nullable during the register → certify window.
   * Replaces the SharedBlob-era `shared_blob_object_id` (see
   * /docs/storage-pool-migration.md).
   */
  pooled_blob_object_id: string | null;
  /** Encoded byte size (post-RS expansion), rounded up to whole MiB. */
  encoded_size_bytes: string;
  seal_identity_b64: string;
  /** User-provided `x-amz-meta-*` headers captured at PUT time. Empty
   *  object → null on the wire to keep the shape minimal. */
  metadata: Record<string, string> | null;
  uploaded_at: string;
  deleted_at: string | null;
  // NOTE: `storage_end_epoch` was per-blob under SharedBlob; under
  // pools, lifetime is shared across the whole pool. Fetch from the
  // pool-level endpoint when Phase I admin UI lands.
}

export type ActivityEventKind =
  | "bucket_created"
  | "bucket_deleted"
  | "object_uploaded"
  | "object_deleted"
  | "knowledge_search"
  | "knowledge_ask";

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
  knowledge: {
    query: string;
    top_k: number;
    chunk_count: number;
    latency_ms: number;
    llm_model: string | null;
    llm_tokens: number | null;
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
  event: SESSION_EVENT,
  read: readSession,
  write(session: StoredSession) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      emitSessionChange();
    }
  },
  clear: clearSession,
};
export type { StoredSession };

// === Billing =================================================================

/** Snapshot of the storage subscription state surfaced on the
 *  `/billing` storage card. Mirrors the CP `getStorageState` shape;
 *  `null` when the project hasn't been through Checkout yet. */
export interface StorageBillingStateJson {
  reserved_mb: number;
  used_mb: number;
  pool_reserved_mb: number;
  stripe_quantity_mb: number;
  monthly_cost_usd_cents: number;
  next_bill_at: string | null;
  pending_downgrade: {
    new_mb: number;
    effective_at: string;
  } | null;
}

export interface ResizeStorageResponse {
  direction: "upgrade" | "downgrade" | "noop";
  effective_at?: string;
  pool_resize_tx?: string;
  stripe_subscription_id?: string;
}

/** One row in the meter table on `/usage`. */
export interface UsageMeterJson {
  meter_name: string;
  label: string;
  unit: string;
  /** Stringified BigInt because raw byte / byte·second totals
   *  overflow `number` quickly. */
  used: string;
  free_band: string;
  billable: string;
  billable_cost_usd_cents: number;
  projected_cost_usd_cents: number;
  daily_average: number;
}

export interface UsageByokJson {
  total_cost_usd_cents: number;
  total_input_tokens: string;
  total_output_tokens: string;
  by_model: Array<{
    model: string;
    input_tokens: string;
    output_tokens: string;
    cost_usd_cents: number;
  }>;
}

/** Stripe BillingAccount row surfaced to the dashboard. `account: null`
 *  means the project hasn't gone through Checkout / SetupIntent yet — the
 *  billing page renders the "add payment method" empty state. */
export interface BillingAccountJson {
  id: string;
  project_id: string;
  stripe_mode: string;
  status: string;
  has_payment_method: boolean;
  currency: string;
  billing_email: string | null;
  country: string | null;
  hard_spend_cap_usd_cents: number | null;
  soft_alert_thresholds: number[];
  stripe_customer_id: string | null;
}

/** One Stripe invoice as surfaced by `GET /v1/billing/invoices/:projectId`.
 *  Hosted URL + PDF link land on Stripe — we never mirror them locally. */
export interface InvoiceJson {
  id: string;
  number: string | null;
  status: string | null;
  /** Unix seconds. */
  period_start: number;
  /** Unix seconds. */
  period_end: number;
  /** Unix seconds. */
  created: number;
  amount_due_usd_cents: number;
  amount_paid_usd_cents: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export interface SetupIntentResponse {
  client_secret: string;
  setup_intent_id: string;
}

/** Per-day usage breakdown for the stacked daily bar chart on /usage.
 *  One entry per UTC day, with the meter name → `{ value, cost_usd_cents }`.
 *  Missing meters on a given day mean zero. */
export interface UsageByDayJson {
  days: Array<{
    day: string; // YYYY-MM-DD
    meters: Record<string, { value: string; cost_usd_cents: number }>;
  }>;
}

export interface UsageCurrentPeriodJson {
  period: {
    start: string;
    end: string;
    days_elapsed: number;
    days_in_period: number;
  };
  total_accrued_usd_cents: number;
  projected_total_usd_cents: number;
  storage: {
    used_mb: number;
    reserved_mb: number;
    /** Real on-chain pool capacity (encoded MB) — the binding constraint
     *  the gauge divides by. Same unit as `used_mb`. */
    pool_reserved_mb: number;
    /** Live object count; ~80 objects fit per 5 GiB pool on testnet. */
    object_count: number;
    monthly_cost_usd_cents: number;
  };
  meters: UsageMeterJson[];
  byok: UsageByokJson;
}
