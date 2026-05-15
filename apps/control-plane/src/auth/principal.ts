/**
 * Unified principal shape for the control plane. The HTTP guard normalises
 * the two accepted credential kinds (browser session JWT, project-scoped
 * bearer token) into this union so controllers don't have to branch on
 * auth method themselves.
 *
 * - `session`  → minted by `/v1/auth/dev-sign-in`. Carries an account
 *                identity (email, sui_address). Used by the dashboard and
 *                any endpoint that needs the human user (account settings,
 *                OAuth consent, key minting).
 * - `api_key`  → `kr_live_…` / `kr_test_…` bearer minted by the dashboard.
 *                Project-scoped, no user identity. Used by scripts, CI,
 *                third-party agents, the MCP server.
 */
export type Principal = SessionPrincipal | ApiKeyPrincipal | ShareTokenPrincipal;

export interface SessionPrincipal {
  kind: "session";
  accountId: string;
  email: string;
  suiAddress: string;
}

export interface ApiKeyPrincipal {
  kind: "api_key";
  accountId: string;
  projectId: string;
  apiKeyId: string;
  /** Empty when the row's scopes column was empty (= full project access). */
  scopes: readonly string[];
}

/**
 * Embed-widget share token (P6). Anonymous traffic from a customer's
 * own site — no account-level identity attached. Scoped to exactly
 * one agent. Origin + per-day caps are enforced by the chat endpoint
 * (origin allowlist + `ShareTokenUsageDay`).
 *
 * NB: a share-token principal must NOT satisfy non-chat endpoints —
 * `requireUser` and `requirePrincipal` callers outside the chat path
 * branch on `kind` and reject this principal. The dashboard, MCP, and
 * CRUD APIs only ever see session + api_key principals.
 */
export interface ShareTokenPrincipal {
  kind: "share_token";
  shareTokenId: string;
  agentId: string;
  /** Origins permitted to call with this token. The chat endpoint
   *  rejects if `req.headers.origin` isn't in this list. */
  allowedOrigins: readonly string[];
  /** Daily request / spend caps. `null` = unlimited. */
  maxRequestsPerDay: number | null;
  maxSpendUsdMicrosPerDay: bigint | null;
  /** When true (default), the model's system prompt includes the
   *  `[chunk N]` citation contract and the response carries the
   *  citations + retrieval-info extension. When false, both are
   *  suppressed — used on widgets where surfacing internal source
   *  paths would be inappropriate. */
  citeSources: boolean;
}

export function principalIsApiKey(p: Principal): p is ApiKeyPrincipal {
  return p.kind === "api_key";
}

export function principalIsSession(p: Principal): p is SessionPrincipal {
  return p.kind === "session";
}

export function principalIsShareToken(p: Principal): p is ShareTokenPrincipal {
  return p.kind === "share_token";
}
