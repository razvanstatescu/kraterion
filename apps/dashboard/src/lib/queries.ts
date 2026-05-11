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

import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import {
  cpFetch,
  type AccountJson,
  type ApiKeyJson,
  type BucketJson,
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
