import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * Token-type discriminator embedded in every Kraterion JWT we issue.
 * Per RFC 8725 §3.11 ("Use Explicit Typing"): when one secret signs
 * multiple kinds of token, each token must declare which kind it is and
 * verifiers must reject the wrong kind. Without this, an OAuth MCP
 * access JWT — same HS256 secret — would parse successfully as a
 * dashboard session and grant cross-surface authority.
 *
 * Format follows the JOSE convention (`application/<vendor>+jwt`):
 *   - `kraterion.session+jwt` — issued by `/v1/auth/zklogin`, 7d TTL,
 *     authorizes dashboard CRUD via `AuthGuard`.
 *   - `kraterion.mcp+jwt`     — issued by `/oauth/token`, 15m TTL,
 *     authorizes `/mcp` tool calls via `McpAuthGuard.authenticateOAuth`.
 *
 * Backward compatibility: a session token signed BEFORE this discriminator
 * shipped has no `typ` claim. We accept it for one TTL window so existing
 * users aren't logged out; the next sign-in stamps the new claim.
 */
export const SESSION_TOKEN_TYPE = "kraterion.session+jwt";

export interface TokenPayload {
  sub: string;
  email: string;
  sui_address: string;
}

export interface VerifiedToken {
  accountId: string;
  email: string;
  suiAddress: string;
}

interface SignedPayload extends TokenPayload {
  typ: typeof SESSION_TOKEN_TYPE;
}

interface VerifiedPayload extends TokenPayload {
  typ?: string;
}

/**
 * Thin wrapper around `JwtService` so callers don't deal with HS256 errors
 * directly. Verify failures rethrow as `ControlPlaneError("Unauthorized")`,
 * which the global filter renders as the standard JSON envelope.
 */
@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: TokenPayload): string {
    const stamped: SignedPayload = { ...payload, typ: SESSION_TOKEN_TYPE };
    return this.jwt.sign(stamped);
  }

  verify(token: string): VerifiedToken {
    let payload: VerifiedPayload;
    try {
      payload = this.jwt.verify<VerifiedPayload>(token);
    } catch (err) {
      const reason = (err as Error).name === "TokenExpiredError" ? "expired" : "invalid";
      throw new ControlPlaneError("Unauthorized", `Token ${reason}`, { reason });
    }

    // RFC 8725 §3.11: reject if the token's declared type isn't what
    // this verifier expects. Missing `typ` is accepted only because we
    // have legacy sessions in the wild — those age out in 7 days and
    // the next sign-in stamps the new claim. Once that window passes,
    // tighten this to require `typ === SESSION_TOKEN_TYPE`.
    if (payload.typ !== undefined && payload.typ !== SESSION_TOKEN_TYPE) {
      throw new ControlPlaneError(
        "Unauthorized",
        "Token is not a Kraterion session token",
        { reason: "wrong-token-type", got: payload.typ },
      );
    }

    return {
      accountId: payload.sub,
      email: payload.email,
      suiAddress: payload.sui_address,
    };
  }
}
