"use client";

/**
 * Sponsored-transaction orchestrator.
 *
 * Walks the full Phase-4 pipeline that
 * `apps/control-plane/scripts/enoki-live-smoke.ts` proved on testnet:
 *
 *   1. POST `/v1/buckets/prepare-*` → `{ digest, bytes, expected }`
 *      The control plane built the PTB, handed kind-bytes to Enoki,
 *      and got back sponsor-signed bytes for the user to sign.
 *   2. `Transaction.from(bytes_base64)` — dApp Kit / @mysten/sui's
 *      reconstructor branch-detects on the leading char; bytes from
 *      Enoki are base64 BCS, so this is the right entry point.
 *   3. `useSignTransaction().mutateAsync({ transaction, chain })` —
 *      pops the Enoki zkLogin wallet's "approve" prompt (frictionless
 *      since we already auth'd). Returns `{ bytes, signature }`.
 *   4. POST `/v1/sponsor/execute { digest, signature }` — backend
 *      relays to Enoki's `executeSponsoredTransaction`, settling
 *      on-chain.
 *   5. `suiClient.waitForTransaction({ digest })` — block until the
 *      tx is finalized so the indexer has a chance to write its row
 *      before we invalidate caches.
 *   6. Invalidate the relevant React Query keys so the read views
 *      pick up the new state.
 *
 * `onStatus` lets the caller drive a tiny UX state machine
 * ("Preparing…" → "Sign with your wallet…" → "Submitting…" → "Settling…").
 */

import { useSignTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { cpFetch, type PrepareTxResponse } from "./api";
import { env } from "./env";

export type SponsorStatus =
  | "preparing"
  | "signing"
  | "executing"
  | "waiting"
  | "done";

export interface RunSponsoredArgs {
  /** The CP endpoint that builds the PTB + asks Enoki to sponsor it. */
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
  const { mutateAsync: signTransaction } = useSignTransaction();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();

  return useCallback(
    async (args: RunSponsoredArgs): Promise<SponsoredTxResult> => {
      const chain = `sui:${env.network}` as const;

      args.onStatus?.("preparing");
      const prepared = await cpFetch<PrepareTxResponse>(args.prepareEndpoint, {
        method: "POST",
        body: args.body ?? {},
      });

      args.onStatus?.("signing");
      // `Transaction.from` accepts the base64 BCS string directly — no
      // need to fromBase64() ourselves. Verified at
      // `@mysten/sui/dist/transactions/Transaction.d.mts:#from`.
      const tx = Transaction.from(prepared.bytes);
      const signed = await signTransaction({ transaction: tx, chain });

      args.onStatus?.("executing");
      const exec = await cpFetch<{ digest: string }>("/v1/sponsor/execute", {
        method: "POST",
        body: { digest: prepared.digest, signature: signed.signature },
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
    [signTransaction, suiClient, queryClient],
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
