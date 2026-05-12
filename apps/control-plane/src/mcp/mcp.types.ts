/**
 * `McpPrincipal` — the resolved identity of an authenticated MCP
 * request, returned by the auth guard and consumed by tool handlers.
 *
 * Two authentication paths produce a principal (per
 * `docs/ai-features-plan.md` §6.4.0):
 *
 *   - **API-key Bearer (K3a, this phase).** Caller sends
 *     `Authorization: Bearer <AKIA>:<secret>`. We look up the
 *     `ApiKey` row by `access_key_id`, KMS-unwrap the secret,
 *     constant-time compare. Resolves to `project_id` + `api_key_id`.
 *     `scopes` is `['mcp:*']` (API-key auth gets the full surface).
 *
 *   - **OAuth 2.1 + PKCE (K3b, future).** Caller sends an `eyJ`-prefixed
 *     JWT. We validate signature + `aud` + Redis denylist. Resolves to
 *     `project_id` + `user_id` + the granted `scopes`. Tools enforce
 *     per-scope authorization at the top of each handler.
 *
 * Tool handlers consume `McpPrincipal` and never branch on which path
 * produced it — that's the entire point of the pluggable guard.
 */

export type McpScope = "mcp:read" | "mcp:write" | "mcp:ask" | "mcp:*";

export interface McpPrincipal {
  /** The account that owns the project. The existing CP services
   *  authorize on `account_id`, so we resolve it once at auth time
   *  and stash it here — tool handlers never re-look-up. */
  account_id: string;
  /** Always set. The scope of every MCP operation. */
  project_id: string;
  /** Set by the bearer path. Mutually exclusive with `user_id`. */
  api_key_id?: string;
  /** Set by the OAuth path (K3b). Mutually exclusive with `api_key_id`. */
  user_id?: string;
  /** `['mcp:*']` for API keys; explicit scope list for OAuth tokens. */
  scopes: McpScope[];
}

/**
 * Tool-side check. `mcp:*` always satisfies any required scope —
 * keeps K3a tool code from caring about scopes at all.
 */
export function principalSatisfies(principal: McpPrincipal, required: McpScope): boolean {
  if (principal.scopes.includes("mcp:*")) return true;
  return principal.scopes.includes(required);
}
