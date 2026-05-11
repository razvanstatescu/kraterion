"use client";

/**
 * TanStack Query hooks against the control plane.
 *
 * Keys are namespaced `['v1', resource, params]` so we can invalidate
 * a whole resource family in one call from mutation handlers. All
 * hooks rely on the Bearer attached by `cpFetch` — no auth wiring
 * inside the hooks themselves.
 *
 * Phase B ships `useMe()` only. Phase C adds buckets / objects / keys.
 */

import { useQuery } from "@tanstack/react-query";
import { cpFetch, type AccountJson, type ProjectJson } from "./api";
import { useCpSession } from "./auth";

interface MeResponse {
  account: AccountJson;
  projects: ProjectJson[];
}

export function useMe() {
  const { session } = useCpSession();
  return useQuery({
    queryKey: ["v1", "me", session?.accountId ?? "anon"],
    queryFn: () => cpFetch<MeResponse>("/v1/me"),
    enabled: Boolean(session?.token),
    // /v1/me is small + the account row doesn't change often; modest stale time.
    staleTime: 60_000,
  });
}
