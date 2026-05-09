/**
 * Wire shape for every `POST /v1/buckets/prepare-*` response.
 *
 * `tx_json` is the string produced by `tx.toJSON()` — the recommended
 * Mysten format for "build on server, sign on client". The dashboard
 * passes it directly into `Transaction.from(tx_json)` (the SDK
 * branch-detects on the leading `{`), then hands the resulting
 * `Transaction` instance to dApp Kit's `useSignAndExecuteTransaction`,
 * which calls `setSenderIfNotSet` automatically.
 *
 * We use `toJSON` (not `build({ onlyTransactionKind: true })`) so
 * shared-object inputs stay symbolic and the client SDK can resolve
 * fresh versions at sign time — important because the bucket's
 * version may bump (someone else grants/revokes/visibility-flips)
 * between the time we built the PTB and the time the user signs.
 *
 * `expected` is a non-binding metadata block: callers MUST NOT depend
 * on these fields for security. They're for the dashboard's
 * confirmation UI ("you're about to call …") and for telemetry.
 */
export interface PrepareTxResponse {
  tx_json: string;
  expected: {
    package_id: string;
    function: string;
    summary: string;
    sender_hint: string;
  };
}
