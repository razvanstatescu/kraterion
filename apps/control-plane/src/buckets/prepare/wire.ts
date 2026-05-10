/**
 * Wire shape for every `POST /v1/buckets/prepare-*` response.
 *
 * Phase 4 introduced Enoki sponsorship: the control plane now hands
 * off the kind-bytes (`tx.build({ client, onlyTransactionKind: true })`)
 * to Enoki's `createSponsoredTransaction`, which constructs the gas
 * envelope and returns the user-signable BCS bytes plus a digest.
 *
 * Wire:
 *   - `bytes` — base64 BCS the dashboard passes to dApp Kit's
 *     `useSignTransaction({ transaction: Transaction.from(bytes) })`.
 *     The signature comes from the Enoki zkLogin wallet.
 *   - `digest` — opaque token tying the user-signature back to the
 *     sponsorship record. The dashboard sends `{ digest, signature }`
 *     to `POST /v1/sponsor/execute`, which relays to Enoki.
 *
 * `expected` is non-binding metadata: callers MUST NOT depend on these
 * fields for security. They're for the dashboard's confirmation UI
 * ("you're about to call …") and for telemetry.
 */
export interface PrepareTxResponse {
  digest: string;
  bytes: string;
  expected: {
    package_id: string;
    function: string;
    summary: string;
    /** The user's zkLogin address. Enoki has already pinned this as `sender`. */
    sender: string;
    /** The exact Move-call target we restricted Enoki to. */
    allowed_move_call_targets: string[];
    sponsored_by: "enoki";
  };
}
