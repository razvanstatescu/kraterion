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
 * Convenience: the account_id behind the request (works for both kinds).
 */
export function requireAccountId(req: FastifyRequest): string {
  return requirePrincipal(req).accountId;
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
}

/** Returns the principal as a session principal, or null if bearer-auth. */
export function asSession(p: Principal): SessionPrincipal | null {
  return p.kind === "session" ? p : null;
}

/** Returns the principal as a bearer principal, or null if session-auth. */
export function asApiKey(p: Principal): ApiKeyPrincipal | null {
  return p.kind === "api_key" ? p : null;
}
