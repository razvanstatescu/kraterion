/**
 * OAuth 2.1 wire-shape definitions for K3b.
 *
 * Validated at the Zod boundary; the service layer consumes the parsed
 * types directly.
 */

import { z } from "zod";

/**
 * Scopes vocabulary. Aligns with `McpScope` (`apps/control-plane/src/mcp/mcp.types.ts`):
 *   - `mcp:read`  — list/search/read tools (list_buckets, list_objects,
 *                   read_object, search, get_manifest)
 *   - `mcp:write` — write_object
 *   - `mcp:ask`   — ask (LLM-using path; some users may want to lock it
 *                   down separately from read access)
 */
export const KNOWN_SCOPES = ["mcp:read", "mcp:write", "mcp:ask"] as const;
export type KnownScope = (typeof KNOWN_SCOPES)[number];

/**
 * Default scope set requested when the client omits `scope`. Mirrors
 * what the consent screen offers by default.
 */
export const DEFAULT_SCOPES: KnownScope[] = ["mcp:read", "mcp:write", "mcp:ask"];

// === Dynamic Client Registration (RFC 7591) ===

export const dcrRequestSchema = z.object({
  client_name: z.string().max(120).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(8),
  // RFC 7591 lists several optional fields; we surface the bare minimum
  // and politely ignore the rest (some clients send `client_uri`,
  // `logo_uri`, etc.). Unknown fields don't error per RFC 7591 §3.1.
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
  scope: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});
export type DcrRequest = z.infer<typeof dcrRequestSchema>;

export interface DcrResponse {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  client_id_issued_at: number;
  // The MCP spec maps "public client" → no client_secret. We make this
  // explicit by NOT including a `client_secret` field in the response;
  // returning one would tempt clients to try confidential-client flows.
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  // RFC 7591 §3.2.1 — required even when null/empty; helps spec-strict
  // clients confirm they're talking to a registration endpoint.
  application_type: "web" | "native";
}

// === /authorize (GET) ===

export const authorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  scope: z.string().optional(),
  state: z.string().optional(),
  // RFC 8707 Resource Indicators — REQUIRED by the MCP spec.
  resource: z.string().url(),
});
export type AuthorizeQuery = z.infer<typeof authorizeQuerySchema>;

// === /authorize/decision (POST from dashboard consent UI) ===

export const consentDecisionSchema = z.object({
  // Opaque key returned from /authorize that points at the stashed
  // request. Cheaper than re-validating the OAuth params on the
  // consent submit — the user might tamper with the URL.
  request_id: z.string().uuid(),
  approve: z.boolean(),
  // Allow the user to narrow scopes on the consent screen. Falls back
  // to the request's requested scopes.
  scopes: z.array(z.string()).optional(),
});
export type ConsentDecision = z.infer<typeof consentDecisionSchema>;

// === /token (POST application/x-www-form-urlencoded or JSON) ===

export const tokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_verifier: z.string().min(43).max(128),
  // RFC 8707 — token requests MAY include `resource` for explicit
  // audience binding. We allow it; if present it must match the
  // grant's stored resource.
  resource: z.string().url().optional(),
});
export type TokenRequest = z.infer<typeof tokenRequestSchema>;

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  // The MCP-spec calls out that issuing `id_token` would be OIDC, not
  // OAuth 2.1. We deliberately omit it.
}
