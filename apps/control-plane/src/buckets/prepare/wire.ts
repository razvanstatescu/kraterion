/**
 * Wire shape for every `POST /v1/buckets/prepare-*` response.
 *
 * Self-hosted sponsorship: the control plane builds the PTB, leases a gas
 * coin from our operator wallet, sets the user as `sender` + operator as
 * gas owner, sponsor-signs, and returns the user-signable BCS bytes + digest.
 *
 * Wire:
 *   - `bytes` — base64 BCS the dashboard signs with its zkLogin identity
 *     (`signWithZkLogin`).
 *   - `digest` — opaque token tying the user-signature back to the stashed
 *     sponsorship reservation. The dashboard sends `{ digest, signature }`
 *     to `POST /v1/sponsor/execute`, which submits with both signatures.
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
    /** The user's zkLogin address, pinned as the tx `sender`. */
    sender: string;
    /** The exact Move-call target(s) the sponsored tx is restricted to. */
    allowed_move_call_targets: string[];
    /** Who paid gas. `kraterion` = our own operator wallet (self-hosted). */
    sponsored_by: "kraterion";
  };
}
