import type { FastifyRequest } from "fastify";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import type { Principal, SessionPrincipal, ApiKeyPrincipal } from "./principal.js";
import type { VerifiedToken } from "./tokens.service.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Populated only when the request authenticated with a session JWT.
     * Kept for back-compat with `requireUser(req)` callers that need the
     * human identity (email, sui_address). Bearer-authenticated requests
     * leave this undefined.
     */
    user?: VerifiedToken;
    /**
     * Unified auth result — present on every authenticated request,
     * regardless of credential kind. Branch on `principal.kind` to
     * distinguish session vs bearer.
     */
    principal?: Principal;
  }
}

/**
 * Returns the verified session token, or throws `Unauthorized` if the
 * request was not authenticated via session JWT. Use this for endpoints
 * that need a real human user (account settings, OAuth consent, key
 * minting) — bearer-authenticated requests will be rejected.
 */
export function requireUser(req: FastifyRequest): VerifiedToken {
  if (!req.user) {
    throw new ControlPlaneError("Unauthorized", "Session authentication required");
  }
  return req.user;
}

/**
 * Returns the principal regardless of auth method. Throws if the route
 * was reached without a guard populating it (defensive against missing
 * `@UseGuards(AuthGuard)`).
 */
export function requirePrincipal(req: FastifyRequest): Principal {
  if (!req.principal) {
    throw new ControlPlaneError("Unauthorized", "Authentication required");
  }
  return req.principal;
}

/**
 * Convenience: the account_id behind the request. Throws Forbidden if
 * the request authenticated with a share-token principal (those have
 * no account identity by design — they're for anonymous embed-widget
 * traffic and only authorize the agent chat endpoint).
 */
export function requireAccountId(req: FastifyRequest): string {
  const p = requirePrincipal(req);
  if (p.kind === "share_token") {
    throw new ControlPlaneError(
      "Forbidden",
      "Share tokens cannot access account-scoped resources.",
    );
  }
  return p.accountId;
}

/**
 * Returns the principal narrowed to session/api-key — the two account-
 * scoped kinds. Use this in controllers where the route is NOT the
 * agent chat endpoint; everywhere else, share-token principals are
 * refused with Forbidden.
 *
 * The chat endpoint uses `requirePrincipal` directly and branches on
 * `kind` itself — it's the one route that accepts share tokens.
 */
export function requireAccountPrincipal(
  req: FastifyRequest,
): SessionPrincipal | ApiKeyPrincipal {
  const p = requirePrincipal(req);
  if (p.kind === "share_token") {
    throw new ControlPlaneError(
      "Forbidden",
      "Share tokens cannot access this endpoint.",
    );
  }
  return p;
}

/**
 * Asserts the principal owns the given project. Bearer tokens are
 * project-scoped so we additionally check `principal.projectId ===
 * projectId`; session principals are account-scoped and ownership is
 * enforced at the database layer (project.account_id === accountId).
 *
 * Callers are still expected to look up the project via the service
 * layer (which does the ownership check); this helper guards bearer
 * tokens against being used to address a sibling project under the
 * same account.
 */
export function assertProjectAccess(
  principal: Principal,
  projectId: string,
): void {
  if (principal.kind === "api_key" && principal.projectId !== projectId) {
    throw new ControlPlaneError("NotFound", "Project not found");
  }
  // Share-token principals are intentionally rejected — they only
  // authorize the agent chat endpoint and have no project scope.
  if (principal.kind === "share_token") {
    throw new ControlPlaneError("Forbidden", "Share tokens cannot access project resources");
  }
}

/** Returns the principal as a session principal, or null if bearer-auth. */
export function asSession(p: Principal): SessionPrincipal | null {
  return p.kind === "session" ? p : null;
}

/** Returns the principal as a bearer principal, or null if session-auth. */
export function asApiKey(p: Principal): ApiKeyPrincipal | null {
  return p.kind === "api_key" ? p : null;
}
