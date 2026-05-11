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
  type ApiKeyJson,
  type BucketJson,
  type FolderMarkerJson,
  type ProjectJson,
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
