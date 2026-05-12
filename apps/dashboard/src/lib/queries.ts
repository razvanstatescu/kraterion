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
  type ApiKeyJson,
  type BucketJson,
  type FolderMarkerJson,
  type ProjectJson,
  type ProviderCredentialJson,
  type ProviderName,
  type S3ObjectJson,
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

// === Provider credentials ====================================================

interface ProviderCredentialsResponse {
  credentials: ProviderCredentialJson[];
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
  /** Bucket-wide default chat model for /ask. Per-request `model`
   *  overrides this; null means "use the global default". */
  default_llm_model: string | null;
  chunk_tokens: number;
  chunk_overlap_tokens: number;
  updated_at: string;
}

export interface KnowledgeStatus {
  enabled: boolean;
  settings: KnowledgeSettings | null;
  summary: KnowledgeSummary;
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
  /** Pass `null` to clear the bucket default; omit to leave unchanged. */
  default_llm_model?: string | null;
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
  default_llm_model?: string | null;
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
  /** Source object's on-chain SharedBlob id (Sui explorer link). */
  source_shared_blob_object_id: string;
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
