"use client";

/**
 * Sponsored-transaction orchestrator (self-hosted; verified by
 * `apps/control-plane/scripts/self-sponsor-smoke.ts` on testnet):
 *
 *   1. POST `/v1/buckets/prepare-*` → `{ digest, bytes, expected }`
 *      The control plane built the PTB, leased a gas coin from our own
 *      operator wallet, sponsor-signed it, and returned the user-signable
 *      bytes + digest.
 *   2. `signWithZkLogin(bytes)` — sign with the ephemeral key, fetch the
 *      Groth16 proof from our prover, and assemble the zkLogin signature.
 *   3. POST `/v1/sponsor/execute { digest, signature }` — backend submits
 *      with `[user, sponsor]` signatures; gas paid by the operator wallet.
 *   4. `suiClient.waitForTransaction({ digest })` — block until finalized so
 *      the indexer can write its row before we invalidate caches.
 *   5. Invalidate the relevant React Query keys so read views refresh.
 *
 * `onStatus` lets the caller drive a tiny UX state machine
 * ("Preparing…" → "Sign…" → "Submitting…" → "Settling…").
 */

import { useSuiClient } from "@mysten/dapp-kit";
import { fromBase64 } from "@mysten/sui/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { cpFetch, type PrepareTxResponse } from "./api";
import { getZkSession, signWithZkLogin } from "./zklogin";

export type SponsorStatus =
  | "preparing"
  | "signing"
  | "executing"
  | "waiting"
  | "done";

export interface RunSponsoredArgs {
  /** The CP endpoint that builds the PTB + sponsors it (operator wallet). */
  prepareEndpoint: string;
  /** Request body for the prepare endpoint. Defaults to `{}`. */
  body?: Record<string, unknown>;
  /** Optional progress callback for UX. */
  onStatus?: (s: SponsorStatus) => void;
  /**
   * Query-cache keys to invalidate on success. Defaults to the bucket
   * family (list + detail + objects). Pass a different array if a
   * specific mutation should refresh additional resources.
   */
  invalidateKeys?: readonly (readonly unknown[])[];
}

export interface SponsoredTxResult {
  digest: string;
  expected: PrepareTxResponse["expected"];
}

export function useSponsoredTx() {
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();

  return useCallback(
    async (args: RunSponsoredArgs): Promise<SponsoredTxResult> => {
      // Guard against a click after the zkLogin session has expired.
      // `RequireAuth` redirects in that case, but a friendlier error here
      // protects pages that mount their own modals (CreateBucket, etc.).
      if (!getZkSession()) {
        throw new Error(
          "Your session expired. Refresh the page and sign in again.",
        );
      }

      args.onStatus?.("preparing");
      const prepared = await cpFetch<PrepareTxResponse>(args.prepareEndpoint, {
        method: "POST",
        body: args.body ?? {},
      });

      args.onStatus?.("signing");
      // Sign the sponsored bytes with our zkLogin identity: sign with the
      // ephemeral key, fetch the proof, and assemble the zkLogin signature.
      const signature = await signWithZkLogin(fromBase64(prepared.bytes));

      args.onStatus?.("executing");
      const exec = await cpFetch<{ digest: string }>("/v1/sponsor/execute", {
        method: "POST",
        body: { digest: prepared.digest, signature },
      });

      args.onStatus?.("waiting");
      await suiClient.waitForTransaction({ digest: exec.digest });

      // Indexer lag is ~30s — invalidating now triggers a refetch that
      // _might_ still miss the row. Either way the next focus/refetch
      // catches up; the optimistic invalidation feels right for the
      // demo cadence.
      const keys = args.invalidateKeys ?? [
        ["v1", "buckets"],
        ["v1", "bucket"],
        ["v1", "objects"],
        ["v1", "object"],
      ];
      for (const key of keys) {
        await queryClient.invalidateQueries({ queryKey: [...key] });
      }

      args.onStatus?.("done");
      return { digest: exec.digest, expected: prepared.expected };
    },
    [suiClient, queryClient],
  );
}

/** Short label for the progress status — surfaced in dialogs / drawers. */
export function statusLabel(s: SponsorStatus): string {
  switch (s) {
    case "preparing": return "Preparing transaction…";
    case "signing":   return "Sign with your wallet…";
    case "executing": return "Submitting on-chain…";
    case "waiting":   return "Waiting for confirmation…";
    case "done":      return "Done.";
  }
}
