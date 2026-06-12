"use client";

/**
 * TanStack Query hooks against the control plane.
 *
 * Keys are namespaced `['v1', resource, params]` so we can invalidate
 * a whole resource family in one call from mutation handlers. All
 * hooks rely on the Bearer attached by `cpFetch` — no auth wiring
 * inside the hooks themselves. Hooks return `undefined` data while
 * loading; consumers should always pattern-match on `.data`.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  cpFetch,
  type AccountJson,
  type ActivityEventJson,
  type AgentBucketGrantJson,
  type AgentJson,
  type ApiKeyJson,
  type BucketJson,
  type FolderMarkerJson,
  type MintBearerResponse,
  type ProjectJson,
  type ProviderCredentialJson,
  type ProviderName,
  type BillingAccountJson,
  type InvoiceJson,
  type ResizeStorageResponse,
  type S3ObjectJson,
  type SetupIntentResponse,
  type StorageBillingStateJson,
  type UsageByDayJson,
  type UsageCurrentPeriodJson,
} from "./api";
import { useCpSession } from "./auth";

interface MeResponse {
  account: AccountJson;
  projects: ProjectJson[];
}

interface BucketsPage {
  buckets: BucketJson[];
  next_cursor: string | null;
}

interface BucketResponse {
  bucket: BucketJson;
}

interface ObjectsPage {
  objects: S3ObjectJson[];
  next_cursor: string | null;
}

interface ObjectResponse {
  object: S3ObjectJson;
}

interface ApiKeysResponse {
  api_keys: ApiKeyJson[];
}

// === Account =================================================================

export function useMe() {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "me", session?.accountId ?? "anon"],
    queryFn: () => cpFetch<MeResponse>("/v1/me"),
    enabled: Boolean(session?.token),
    staleTime: 60_000,
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      cpFetch<MeResponse>("/v1/me/cancel", {
        method: "PATCH",
        body: { confirm: true },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "me"] });
    },
  });
}

// === Buckets =================================================================

export interface UseBucketsOptions {
  projectId?: string | undefined;
  includeDeleted?: boolean | undefined;
  limit?: number | undefined;
}

/**
 * Infinite-paginated bucket list. Use `data.pages.flatMap(p => p.buckets)`
 * to render; trigger `fetchNextPage()` when `hasNextPage` is true.
 */
export function useBuckets(opts: UseBucketsOptions = {}) {
  const { session } = useCpSession();
  const params = new URLSearchParams();
  if (opts.projectId) params.set("project_id", opts.projectId);
  if (opts.includeDeleted) params.set("include_deleted", "true");
  if (opts.limit) params.set("limit", String(opts.limit));
  const baseQuery = params.toString();

  return useInfiniteQuery<BucketsPage, Error, InfiniteData<BucketsPage>, readonly unknown[], string | null>({
    queryKey: ["v1", "buckets", session?.accountId ?? "anon", baseQuery],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams(baseQuery);
      if (pageParam) q.set("cursor", pageParam);
      const qs = q.toString();
      return cpFetch<BucketsPage>(`/v1/buckets${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(session?.token),
    staleTime: 10_000,
  });
}

export function useBucket(bucketId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "bucket", bucketId ?? "none"],
    queryFn: () => cpFetch<BucketResponse>(`/v1/buckets/${bucketId}`),
    enabled: Boolean(session?.token && bucketId),
    staleTime: 10_000,
  });
}

// === Objects =================================================================

export interface UseObjectsOptions {
  prefix?: string | undefined;
  includeDeleted?: boolean | undefined;
  limit?: number | undefined;
}

export function useObjects(bucketId: string | undefined, opts: UseObjectsOptions = {}) {
  const { session } = useCpSession();
  const params = new URLSearchParams();
  if (opts.prefix) params.set("prefix", opts.prefix);
  if (opts.includeDeleted) params.set("include_deleted", "true");
  if (opts.limit) params.set("limit", String(opts.limit));
  const baseQuery = params.toString();

  return useInfiniteQuery<ObjectsPage, Error, InfiniteData<ObjectsPage>, readonly unknown[], string | null>({
    queryKey: ["v1", "objects", bucketId ?? "none", baseQuery],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams(baseQuery);
      if (pageParam) q.set("cursor", pageParam);
      const qs = q.toString();
      return cpFetch<ObjectsPage>(`/v1/buckets/${bucketId}/objects${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(session?.token && bucketId),
    staleTime: 10_000,
  });
}

export function useObject(objectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "object", objectId ?? "none"],
    queryFn: () => cpFetch<ObjectResponse>(`/v1/objects/${objectId}`),
    enabled: Boolean(session?.token && objectId),
    staleTime: 10_000,
  });
}

// === Activity ================================================================

interface ActivityResponse {
  events: ActivityEventJson[];
}

/**
 * Unified user-visible event stream — bucket creates/deletes plus
 * object uploads/soft-deletes, sorted reverse-chronologically. Driven
 * by the CP's `/v1/activity` endpoint so we get a single join across
 * tables instead of fanning a per-bucket query out from the client.
 */
export function useActivity(opts: { limit?: number } = {}) {
  const { session } = useCpSession();
  const limit = opts.limit ?? 50;
  return useQuery({
    queryKey: ["v1", "activity", session?.accountId ?? "anon", limit],
    queryFn: () => cpFetch<ActivityResponse>(`/v1/activity?limit=${limit}`),
    enabled: Boolean(session?.token),
    staleTime: 10_000,
  });
}

// === Folder markers ==========================================================

interface FoldersResponse {
  folders: FolderMarkerJson[];
}

interface FolderResponse {
  folder: FolderMarkerJson;
}

/**
 * Lists every folder marker for the bucket. The browser merges them
 * with prefixes derived from real object keys, so we don't bother with
 * server-side parent filtering — markers are cheap rows.
 */
export function useFolderMarkers(bucketId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "folders", bucketId ?? "none"],
    queryFn: () => cpFetch<FoldersResponse>(`/v1/buckets/${bucketId}/folders`),
    enabled: Boolean(session?.token && bucketId),
    staleTime: 10_000,
  });
}

export function useCreateFolder(bucketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; parentPrefix: string }) =>
      cpFetch<FolderResponse>(`/v1/buckets/${bucketId}/folders`, {
        method: "POST",
        body: { name: vars.name, parent_prefix: vars.parentPrefix },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "folders", bucketId ?? "none"] });
    },
  });
}

interface FolderPreviewResponse {
  object_count: number;
  marker_count: number;
}

/**
 * Preview of what `usePurgeFolder` will affect. Used by the
 * "Delete folder" dialog to decide whether to require typed confirmation
 * and to display object counts.
 */
export function useFolderPreview(bucketId: string | undefined, prefix: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "folders", bucketId ?? "none", "preview", prefix ?? ""],
    queryFn: () => {
      const qs = new URLSearchParams({ prefix: prefix! }).toString();
      return cpFetch<FolderPreviewResponse>(`/v1/buckets/${bucketId}/folders/preview?${qs}`);
    },
    enabled: Boolean(session?.token && bucketId && prefix),
    staleTime: 0,
    gcTime: 0,
  });
}

interface PurgeResponse {
  objects_deleted: number;
  markers_deleted: number;
}

/**
 * Recursive soft-delete of every object + marker under the prefix.
 * On-chain SharedBlobs persist — see CP-side service docs.
 */
export function usePurgeFolder(bucketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prefix: string) =>
      cpFetch<PurgeResponse>(`/v1/buckets/${bucketId}/folders/purge`, {
        method: "POST",
        body: { prefix },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "folders", bucketId ?? "none"] });
      void queryClient.invalidateQueries({ queryKey: ["v1", "objects", bucketId ?? "none"] });
    },
  });
}

// === API keys ================================================================

export function useApiKeys(projectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "api-keys", projectId ?? "none"],
    queryFn: () => cpFetch<ApiKeysResponse>(`/v1/projects/${projectId}/api-keys`),
    enabled: Boolean(session?.token && projectId),
    staleTime: 30_000,
  });
}

/**
 * Shape of `POST /v1/projects/:id/api-keys` — `secret` only appears here,
 * once, at mint time. The dashboard shows it in a "save it now" panel
 * and drops it from memory when the dialog closes.
 */
export interface MintedApiKey {
  api_key: ApiKeyJson;
  secret: string;
  WARNING: string;
}

export function useMintApiKey(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      cpFetch<MintedApiKey>(`/v1/projects/${projectId}/api-keys`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "api-keys", projectId ?? "none"] });
      // First-run onboarding card unlocks step 4 ("Plug into your stack")
      // once an API key exists.
      void queryClient.invalidateQueries({ queryKey: ["v1", "onboarding"] });
    },
  });
}

export function useRevokeApiKey(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiKeyId: string) =>
      cpFetch<{ id: string; revoked_at: string }>(`/v1/api-keys/${apiKeyId}/revoke`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "api-keys", projectId ?? "none"] });
    },
  });
}

/**
 * Mint a unified bearer token (`kr_live_…` / `kr_test_…`). The cleartext
 * is returned once in the response body; the UI shows it behind a
 * "shown only once" warning and forgets it on close.
 */
export function useMintBearerToken(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      cpFetch<MintBearerResponse>(`/v1/projects/${projectId}/api-keys/bearer`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "api-keys", projectId ?? "none"] });
    },
  });
}

// === P6 — Embed widget share tokens =========================================

import type { MintShareTokenResponse, ShareTokenJson } from "./api";

export function useShareTokens(agentId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "agents", agentId ?? "none", "share-tokens"],
    queryFn: () =>
      cpFetch<{ share_tokens: ShareTokenJson[] }>(
        `/v1/agents/${agentId}/share-tokens`,
      ),
    enabled: Boolean(session?.token && agentId),
    staleTime: 30_000,
  });
}

export interface MintShareTokenInput {
  name: string;
  allowed_origins: string[];
  max_requests_per_day: number | null;
  max_spend_usd_per_day: number | null;
  cite_sources: boolean;
}

export function useMintShareToken(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MintShareTokenInput) =>
      cpFetch<MintShareTokenResponse>(`/v1/agents/${agentId}/share-tokens`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", agentId ?? "none", "share-tokens"],
      });
    },
  });
}

export interface UpdateShareTokenInput {
  name?: string;
  allowed_origins?: string[];
  max_requests_per_day?: number | null;
  max_spend_usd_per_day?: number | null;
  cite_sources?: boolean;
}

export function useUpdateShareToken(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tokenId,
      input,
    }: {
      tokenId: string;
      input: UpdateShareTokenInput;
    }) =>
      cpFetch<{ share_token: ShareTokenJson }>(`/v1/share-tokens/${tokenId}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", agentId ?? "none", "share-tokens"],
      });
    },
  });
}

export function useRevokeShareToken(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tokenId: string) =>
      cpFetch<{ id: string; revoked_at: string }>(
        `/v1/share-tokens/${tokenId}/revoke`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", agentId ?? "none", "share-tokens"],
      });
    },
  });
}

// === Provider credentials ====================================================

interface ProviderCredentialsResponse {
  credentials: ProviderCredentialJson[];
  /** Number of buckets in the project with Knowledge currently enabled.
   *  Removing the provider credential cascades disable on each, so the
   *  dashboard's confirmation modal pre-fills its copy from this value. */
  active_knowledge_buckets: number;
}

interface UpsertCredentialResponse {
  credential: ProviderCredentialJson;
}

export function useProviderCredentials(projectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "credentials", projectId ?? "none"],
    queryFn: () =>
      cpFetch<ProviderCredentialsResponse>(`/v1/projects/${projectId}/credentials`),
    enabled: Boolean(session?.token && projectId),
    staleTime: 30_000,
  });
}

export function useUpsertCredential(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { provider: ProviderName; api_key: string }) =>
      cpFetch<UpsertCredentialResponse>(
        `/v1/projects/${projectId}/credentials/${args.provider}`,
        { method: "PUT", body: { api_key: args.api_key } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "credentials", projectId ?? "none"],
      });
    },
  });
}

interface RemoveCredentialResponse {
  disabled_buckets: number;
}

export function useRemoveCredential(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { provider: ProviderName; cascade?: boolean }) => {
      const qs = args.cascade ? "?cascade=true" : "";
      return cpFetch<RemoveCredentialResponse>(
        `/v1/projects/${projectId}/credentials/${args.provider}${qs}`,
        { method: "DELETE" },
      );
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "credentials", projectId ?? "none"],
      });
      // Cascade-disable also wipes KnowledgeBucketSettings + chunks for
      // every bucket in the project. Invalidate everything that reads
      // Knowledge state so the bucket pages re-render in their "off"
      // state immediately.
      if (data.disabled_buckets > 0) {
        void queryClient.invalidateQueries({ queryKey: ["v1", "knowledge"] });
      }
    },
  });
}

// === Knowledge ===============================================================

export interface KnowledgeSummary {
  total_objects: number;
  /** Stringified BigInt — sum of `S3Object.size_bytes` for the bucket.
   *  Powers the enable-Knowledge modal's indexing-cost preview. */
  total_bytes: string;
  indexed: number;
  pending: number;
  failed: number;
  skipped: number;
}

export interface KnowledgeSettings {
  embedding_model: string;
  embedding_dimensions: number;
  chunk_tokens: number;
  chunk_overlap_tokens: number;
  updated_at: string;
}

/** Minimal agent reference for the Knowledge tab's disable warning. */
export interface AttachedAgentSummary {
  id: string;
  name: string;
}

export interface KnowledgeStatus {
  enabled: boolean;
  settings: KnowledgeSettings | null;
  summary: KnowledgeSummary;
  /** Active agents attached to this bucket. Drives the disable-Knowledge
   *  confirmation modal — listing them keeps destruction intentional. */
  attached_agents?: AttachedAgentSummary[];
}

export function useKnowledgeStatus(bucketId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "knowledge", bucketId ?? "none"],
    queryFn: () => cpFetch<KnowledgeStatus>(`/v1/buckets/${bucketId}/knowledge`),
    enabled: Boolean(session?.token && bucketId),
    staleTime: 5_000,
    // Auto-refresh while the indexer is draining — caller flips this on.
    refetchInterval: false as const,
  });
}

export interface ToggleKnowledgeResponse {
  enabled: boolean;
  backfilled_objects?: number;
  /** True when the enable response intentionally skipped the backfill
   *  because the on-chain indexer grant hadn't landed yet. The
   *  dashboard kicks the backfill via the dedicated endpoint after the
   *  sponsored grant tx confirms. */
  backfill_deferred?: boolean;
  chunks_deleted?: number;
  /** Sui address of the worker's `knowledge_indexer` sub-wallet. Present
   *  on both enable and disable responses; the dashboard reads this to
   *  decide whether to follow up with a sponsored on-chain grant or
   *  revoke tx. */
  indexer_address?: string;
  /** Enable path: true when the indexer is NOT yet on the bucket's
   *  `api_decryption_addresses` list — dashboard must trigger a grant tx
   *  before manifests can be archived on chain (K5). */
  needs_indexer_grant?: boolean;
  /** Disable path: true when the indexer IS on the bucket's
   *  `api_decryption_addresses` list — dashboard fires a sponsored
   *  `revoke-indexer` tx so the indexer's on-chain authority doesn't
   *  outlive the disable intent. */
  needs_indexer_revoke?: boolean;
}

/**
 * Enable / disable Knowledge on a bucket. The enable payload now
 * carries the user's picks from the multi-step modal — embedding
 * model + dimensions and the bucket's default chat model. Omitting a
 * field defers to the CP's defaults (text-embedding-3-small @ 1024d,
 * no default chat model).
 */
export interface ToggleKnowledgePayload {
  enabled: boolean;
  embedding_model?: string;
  embedding_dimensions?: number;
  chunk_tokens?: number;
  chunk_overlap_tokens?: number;
}

export function useToggleKnowledge(bucketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ToggleKnowledgePayload | boolean) => {
      const body: ToggleKnowledgePayload =
        typeof payload === "boolean" ? { enabled: payload } : payload;
      return cpFetch<ToggleKnowledgeResponse>(
        `/v1/buckets/${bucketId}/knowledge`,
        { method: "POST", body },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "knowledge", bucketId ?? "none"] });
      void queryClient.invalidateQueries({ queryKey: ["v1", "bucket", bucketId ?? "none"] });
    },
  });
}

/**
 * Kick the deferred backfill after the sponsored `grant_api_access`
 * tx confirms. The enable response sets `backfill_deferred: true`
 * when the indexer wasn't yet on the bucket; we hold the queue until
 * the on-chain grant lands to avoid burning archive attempts against
 * an unauthorized bucket.
 */
export function useKnowledgeBackfill(bucketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      cpFetch<{ queued_objects: number }>(
        `/v1/buckets/${bucketId}/knowledge/backfill`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "knowledge", bucketId ?? "none"] });
    },
  });
}

/**
 * Destructive re-index. Drops every live chunk for the bucket and
 * re-enqueues every object with the supplied settings. Search returns
 * empty until the worker drains the new pass.
 */
export interface ReindexKnowledgePayload {
  embedding_model?: string;
  embedding_dimensions?: number;
  chunk_tokens?: number;
  chunk_overlap_tokens?: number;
}

export interface ReindexKnowledgeResponse {
  chunks_deleted: number;
  queued_objects: number;
  settings: { embedding_model: string; embedding_dimensions: number };
}

export function useReindexKnowledge(bucketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReindexKnowledgePayload) =>
      cpFetch<ReindexKnowledgeResponse>(
        `/v1/buckets/${bucketId}/knowledge/reindex`,
        { method: "POST", body: payload },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "knowledge", bucketId ?? "none"] });
    },
  });
}

/**
 * Search hit shape mirrors `KnowledgeService.search()` — see
 * `apps/control-plane/src/knowledge/knowledge.service.ts`. Score legs
 * stay separate so power users can inspect why something ranked.
 */
export interface KnowledgeSearchHit {
  id: string;
  s3_object_id: string;
  s3_key: string;
  bucket_id: string;
  manifest_id: string;
  ordinal: number;
  content: string;
  content_hash: string;
  /** Source object's Walrus blob id — the Walruscan deep-link target. */
  source_walrus_blob_id: string;
  /** Source object's on-chain PooledBlob id (Sui explorer link). Nullable
   *  during the brief register → certify window after upload. */
  source_pooled_blob_object_id: string | null;
  /** Manifest's Walrus blob id (K5). Null until the worker archives it. */
  manifest_walrus_blob_id: string | null;
  rrf_score: number;
  bm25_score: number | null;
  vector_distance: number | null;
}

export interface KnowledgeSearchResponse {
  hits: KnowledgeSearchHit[];
  query_tokens: number;
  embedding_model: string;
  embedding_dimensions: number;
  latency_ms: number;
}

export function useKnowledgeSearch(bucketId: string | undefined) {
  return useMutation({
    mutationFn: async ({ query, topK }: { query: string; topK?: number }) =>
      cpFetch<KnowledgeSearchResponse>(`/v1/buckets/${bucketId}/knowledge/search`, {
        method: "POST",
        body: { query, ...(topK !== undefined ? { top_k: topK } : {}) },
      }),
  });
}

// === OAuth (connected agents) =================================================

export type McpScope = "mcp:read" | "mcp:write" | "mcp:ask" | "mcp:*";

export interface OAuthClientJson {
  client_id: string;
  client_name: string | null;
  resource: string;
  scopes: McpScope[];
  last_consent_at: string;
  last_used_at: string | null;
  first_seen_at: string;
  grant_count: number;
}

export function useOAuthClients() {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "oauth", "clients"],
    queryFn: () =>
      cpFetch<{ clients: OAuthClientJson[] }>("/v1/oauth/clients"),
    enabled: Boolean(session?.token),
    staleTime: 10_000,
  });
}

export function useDisconnectOAuthClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) =>
      cpFetch<{ client_id: string; grants_deleted: number }>(
        `/v1/oauth/clients/${encodeURIComponent(clientId)}/grants`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "oauth", "clients"] });
    },
  });
}

// === Agents (P3) =============================================================

interface AgentListResponse {
  agents: AgentJson[];
}
interface AgentResponse {
  agent: AgentJson;
}

export function useAgents(projectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "agents", projectId ?? "none"],
    queryFn: () =>
      cpFetch<AgentListResponse>(`/v1/agents?project_id=${projectId}`),
    enabled: Boolean(session?.token && projectId),
    staleTime: 10_000,
  });
}

export function useAgent(agentId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "agents", "byId", agentId ?? "none"],
    queryFn: () => cpFetch<AgentResponse>(`/v1/agents/${agentId}`),
    enabled: Boolean(session?.token && agentId),
    staleTime: 10_000,
  });
}

// === P9 (D12) — Replayable runs ===========================================

/** Mirrors the JSON returned by `GET /v1/agents/:agentId/sessions`. */
export interface AgentSessionJson {
  id: string;
  status: "open" | "flushing" | "anchored" | "failed";
  principal_kind: "session" | "api_key" | "share_token" | (string & {});
  opened_at: string;
  last_activity_at: string;
  closed_at: string | null;
  close_reason: string | null;
  invocation_count: number;
  /** Set only when `status === 'anchored'`. The base58 Sui digest the
   *  user pastes into `kraterion replay` (or clicks through to
   *  Suiscan). */
  tx_digest: string | null;
}

interface AgentSessionListResponse {
  sessions: AgentSessionJson[];
}

/** Latest sessions for an agent, newest first. Polls every 5s so the
 *  dashboard reflects the sweeper transition open → flushing →
 *  anchored without a manual refresh. */
export function useAgentSessions(agentId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "agents", agentId ?? "none", "sessions"],
    queryFn: () =>
      cpFetch<AgentSessionListResponse>(`/v1/agents/${agentId}/sessions`),
    enabled: Boolean(session?.token && agentId),
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}

/** Replay-endpoint response shape. Mirrors `RunsService.verify(...)`'s
 *  return; the optional `replay` field is populated when the dashboard
 *  passes `rerun=true`. */
export interface ReplayResponseJson {
  tx_digest: string;
  session_id: string;
  agent_id: string;
  project_id: string;
  invocation_count: number;
  anchored_at: string;
  walrus_blob_id: string;
  trace_hash_hex: string;
  trace_hash_matches: boolean;
  trace: Record<string, unknown>;
  replay?: {
    turns: Array<{
      ordinal: number;
      invocation_id: string;
      captured_output: string;
      replay_output: string;
      captured_system_fingerprint: string | null;
      replay_system_fingerprint: string | null;
      system_fingerprint_matched: boolean;
      tool_calls_replayed: string[];
      diff: {
        differs: boolean;
        lines: Array<{ kind: "equal" | "captured" | "replay"; text: string }>;
      };
    }>;
    any_output_differs: boolean;
    any_fingerprint_mismatch: boolean;
  };
}

/** P9 Feature 2 — Mirror of the OpenLineage envelope the
 *  `/v1/runs/:txDigest/lineage` endpoint returns. Kept narrow — only
 *  the fields the dashboard consumes. The full shape is defined in
 *  `apps/control-plane/src/runs/build-lineage.ts`. */
export interface LineageEnvelopeJson {
  kraterion_lineage_version: number;
  session: {
    id: string;
    agent_id: string;
    anchored_tx_digest: string;
    opened_at: string;
    closed_at: string | null;
    trace_hash_hex: string;
  };
  job: {
    namespace: string;
    name: string;
    facets: Record<string, unknown>;
  };
  runs: Array<{
    runId: string;
    ordinal: number;
    eventTime: string;
    state: string;
    facets: {
      "kraterion.run"?: {
        model?: {
          resolved: string | null;
          requested: string | null;
          system_fingerprint: string | null;
          seed: number | null;
        };
      };
    };
    inputs: Array<{
      namespace: string;
      name: string;
      facets: Record<string, unknown>;
    }>;
    outputs: Array<{
      namespace: string;
      name: string;
      facets: Record<string, unknown>;
    }>;
  }>;
}

/** Fetch the OpenLineage envelope for an anchored session. Same auth
 *  + decrypt path as `useRunReplay`; separate React Query key. */
export function useRunLineage(txDigest: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "runs", txDigest ?? "none", "lineage"],
    queryFn: () =>
      cpFetch<LineageEnvelopeJson>(`/v1/runs/${txDigest}/lineage`),
    enabled: Boolean(session?.token && txDigest),
    staleTime: 60_000,
  });
}

/** Fetch a run by tx digest. Loaded on-demand when the user clicks a
 *  session row in the Runs tab. */
export function useRunReplay(args: {
  txDigest: string | undefined;
  rerun: boolean;
}) {
  const { session } = useCpSession();
  const { txDigest, rerun } = args;
  return useQuery({
    queryKey: ["v1", "runs", txDigest ?? "none", rerun ? "rerun" : "verify"],
    queryFn: () =>
      cpFetch<ReplayResponseJson>(
        `/v1/runs/${txDigest}/replay${rerun ? "?rerun=true" : ""}`,
      ),
    enabled: Boolean(session?.token && txDigest),
    // Rerun is expensive (real LLM calls). Keep it cached aggressively.
    staleTime: 60_000,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  system_prompt: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_k?: number;
  bucket_ids: string[];
  tools?: string[];
}

export function useCreateAgent(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAgentInput) =>
      cpFetch<AgentResponse>(`/v1/projects/${projectId}/agents`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", projectId ?? "none"],
      });
      // First-run onboarding card ticks step 3 once an agent exists.
      void queryClient.invalidateQueries({ queryKey: ["v1", "onboarding"] });
    },
  });
}

export interface UpdateAgentInput {
  name?: string;
  description?: string | null;
  system_prompt?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_k?: number;
  bucket_ids?: string[];
  tools?: string[];
}

export function useUpdateAgent(agentId: string | undefined, projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAgentInput) =>
      cpFetch<AgentResponse>(`/v1/agents/${agentId}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", "byId", agentId ?? "none"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", projectId ?? "none"],
      });
    },
  });
}

export function useRevokeAgent(agentId: string | undefined, projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      cpFetch<AgentResponse>(`/v1/agents/${agentId}/revoke`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", "byId", agentId ?? "none"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", projectId ?? "none"],
      });
    },
  });
}

export function useDeleteAgent(agentId: string | undefined, projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      cpFetch<null>(`/v1/agents/${agentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", projectId ?? "none"],
      });
    },
  });
}

// === Agents — on-chain grants ================================================

interface AgentGrantsResponse {
  grants: AgentBucketGrantJson[];
}

/**
 * Per-bucket on-chain grant status for an agent's sub-wallet. The CP
 * queries each bucket's `api_decryption_addresses` from Sui RPC — one
 * call per bucket — so we keep this on a slower staleTime than DB
 * reads. Refetch happens when the user fires a grant/revoke tx.
 */
export function useAgentGrants(agentId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "agents", "grants", agentId ?? "none"],
    queryFn: () => cpFetch<AgentGrantsResponse>(`/v1/agents/${agentId}/grants`),
    enabled: Boolean(session?.token && agentId),
    staleTime: 30_000,
  });
}

// === Billing =================================================================

interface StorageStateResponse {
  state: StorageBillingStateJson | null;
}

/** Snapshot read for the `/billing` storage card. Refetched on
 *  resize success so the dashboard reflects within ~5s of the
 *  indexer-ack ping (the resize-flow handler waits for the
 *  indexer before returning, so the next refetch is correct). */
export function useStorageBillingState(projectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "billing", "storage", "state", projectId ?? "none"],
    queryFn: () =>
      cpFetch<StorageStateResponse>(`/v1/billing/storage/state/${projectId}`),
    enabled: Boolean(session?.token && projectId),
    staleTime: 10_000,
  });
}

/** Resize the project's storage reservation. Server decides upgrade
 *  vs scheduled downgrade based on direction. On success we
 *  invalidate the storage-state query so the card re-renders. */
export function useResizeStorage(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { new_reserved_mb: number }) =>
      cpFetch<ResizeStorageResponse>("/v1/billing/storage/resize", {
        method: "POST",
        body: { project_id: projectId, new_reserved_mb: args.new_reserved_mb },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "billing", "storage", "state", projectId],
      });
    },
  });
}

/** Per-day usage breakdown for the stacked-bar chart on `/usage`.
 *  Window is exclusive on `to` and inclusive on `from`. Caller
 *  passes ISO timestamps; the server returns one entry per UTC day
 *  in the range, padding missing days with empty meters maps.
 *
 *  React Query cache key includes the window so the period selector
 *  re-fetches when the user changes range. Stale time 60 s so
 *  rapid period flips don't hammer the server. */
export function useUsageByDay(
  projectId: string | undefined,
  fromIso: string | undefined,
  toIso: string | undefined,
) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: [
      "v1",
      "usage",
      "by-day",
      projectId ?? "none",
      fromIso ?? "",
      toIso ?? "",
    ],
    queryFn: () => {
      const qs = new URLSearchParams({
        from: fromIso!,
        to: toIso!,
      }).toString();
      return cpFetch<UsageByDayJson>(
        `/v1/usage/by-day/${projectId}?${qs}`,
      );
    },
    enabled: Boolean(session?.token && projectId && fromIso && toIso),
    staleTime: 60_000,
  });
}

/** Current-period usage rollup for the `/usage` page. Refetched
 *  every 30 s so the meter table reflects newly-arrived rollup
 *  ticks without manual reloads. */
export function useUsageCurrentPeriod(projectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "usage", "current-period", projectId ?? "none"],
    queryFn: () =>
      cpFetch<UsageCurrentPeriodJson>(`/v1/usage/current-period/${projectId}`),
    enabled: Boolean(session?.token && projectId),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

/** BillingAccount row for the project. `{ account: null }` means
 *  pre-Checkout — the billing page renders the empty-state PaymentMethod
 *  card. Refetched on every navigation so card-attach + cap edits
 *  reflect immediately. */
export function useBillingAccount(projectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "billing", "account", projectId ?? "none"],
    queryFn: () =>
      cpFetch<{ account: BillingAccountJson | null }>(
        `/v1/billing/account/${projectId}`,
      ),
    enabled: Boolean(session?.token && projectId),
    staleTime: 10_000,
  });
}

/** Mint a SetupIntent for inline `<PaymentElement />`. The dashboard
 *  calls this once when mounting the empty-state card and uses the
 *  returned `client_secret` to render the iframe. Each mint creates a
 *  fresh SetupIntent so re-opening the card after a cancel works. */
export function useCreateSetupIntent(projectId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      cpFetch<SetupIntentResponse>("/v1/billing/setup-intent", {
        method: "POST",
        body: { project_id: projectId },
      }),
  });
}

/** Open a Customer Portal session. Returns the hosted URL — caller
 *  navigates `window.location.href = url`. Used by "Manage in Stripe"
 *  deep links for invoice PDFs, tax info, payment-method swap. */
export function useOpenBillingPortal(projectId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      cpFetch<{ url: string }>("/v1/billing/portal-session", {
        method: "POST",
        body: {
          project_id: projectId,
          return_url:
            typeof window !== "undefined"
              ? `${window.location.origin}/billing`
              : "https://app.kraterion.com/billing",
        },
      }),
  });
}

/** Live read of the 12 most recent invoices. Stripe is source of truth
 *  — we never mirror invoices locally. 5-minute stale time so the
 *  dashboard doesn't hammer Stripe between page navigations. */
export function useInvoices(projectId: string | undefined) {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "billing", "invoices", projectId ?? "none"],
    queryFn: () =>
      cpFetch<{ invoices: InvoiceJson[] }>(
        `/v1/billing/invoices/${projectId}`,
      ),
    enabled: Boolean(session?.token && projectId),
    staleTime: 300_000,
  });
}

/** Patch `hard_spend_cap_usd_cents` + `soft_alert_thresholds`. The
 *  cap can be `null` to remove it entirely. */
export interface UpdateSpendCapInput {
  hard_cap_usd_cents: number | null;
  alert_thresholds?: number[];
}
export function useUpdateSpendCap(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSpendCapInput) =>
      cpFetch<{
        hard_spend_cap_usd_cents: number | null;
        alert_thresholds: number[];
      }>("/v1/billing/spend-cap", {
        method: "PATCH",
        body: { project_id: projectId, ...input },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "billing", "account", projectId],
      });
    },
  });
}

/** Patch billing email / tax id / country. Each field is independently
 *  optional. */
export interface UpdateBillingDetailsInput {
  billing_email?: string | null;
  tax_id?: string | null;
  country?: string | null;
}
export function useUpdateBillingDetails(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBillingDetailsInput) =>
      cpFetch<{
        billing_email: string | null;
        tax_id: string | null;
        country: string | null;
      }>("/v1/billing/details", {
        method: "PATCH",
        body: { project_id: projectId, ...input },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "billing", "account", projectId],
      });
    },
  });
}

/** Cancel the subscription at the end of the current period. The
 *  customer keeps their capacity until the boundary; the
 *  `customer.subscription.deleted` webhook flips the status. */
export function useCancelBillingSubscription(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      cpFetch<{ cancel_at: number | null }>(
        "/v1/billing/cancel-subscription",
        {
          method: "POST",
          body: { project_id: projectId },
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "billing", "account", projectId],
      });
    },
  });
}

// === Onboarding ==============================================================

export type OnboardingStepKey =
  | "buckets"
  | "knowledge"
  | "agents"
  | "integrations";

export interface OnboardingState {
  dismissed_at: string | null;
  steps: { key: OnboardingStepKey; completed: boolean }[];
}

/** First-run "Get started" card state. Re-queried on focus + every 30s
 *  so the card auto-updates as the user creates buckets / agents in
 *  another tab. */
export function useOnboarding() {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "onboarding", session?.accountId ?? "anon"],
    queryFn: () => cpFetch<OnboardingState>("/v1/onboarding"),
    enabled: Boolean(session?.token),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useDismissOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      cpFetch<{ ok: true }>("/v1/onboarding/dismiss", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "onboarding"] });
    },
  });
}

export function useResetOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      cpFetch<{ ok: true }>("/v1/onboarding/reset", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1", "onboarding"] });
    },
  });
}

/** Cancel a scheduled downgrade. Same invalidation pattern as resize. */
export function useCancelPendingDowngrade(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      cpFetch<{ cancelled: boolean; previous_status: string | null }>(
        "/v1/billing/storage/pending-downgrade",
        {
          method: "DELETE",
          body: { project_id: projectId },
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v1", "billing", "storage", "state", projectId],
      });
    },
  });
}
