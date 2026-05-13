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
export type Principal = SessionPrincipal | ApiKeyPrincipal;

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

export function principalIsApiKey(p: Principal): p is ApiKeyPrincipal {
  return p.kind === "api_key";
}

export function principalIsSession(p: Principal): p is SessionPrincipal {
  return p.kind === "session";
}
