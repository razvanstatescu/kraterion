import type { FastifyRequest } from "fastify";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import type { VerifiedToken } from "./tokens.service.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: VerifiedToken;
  }
}

/**
 * Asserts the JWT guard ran and populated `req.user`. Throws `Unauthorized`
 * if it didn't — defensive against accidentally exposing a route that
 * forgot to declare `@UseGuards(AuthGuard)`.
 */
export function requireUser(req: FastifyRequest): VerifiedToken {
  if (!req.user) {
    throw new ControlPlaneError("Unauthorized", "Authentication required");
  }
  return req.user;
}
