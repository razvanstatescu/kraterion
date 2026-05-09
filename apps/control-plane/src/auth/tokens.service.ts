import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ControlPlaneError } from "../errors/control-plane-error.js";

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

/**
 * Thin wrapper around `JwtService` so callers don't deal with HS256 errors
 * directly. Verify failures rethrow as `ControlPlaneError("Unauthorized")`,
 * which the global filter renders as the standard JSON envelope.
 */
@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: TokenPayload): string {
    return this.jwt.sign(payload);
  }

  verify(token: string): VerifiedToken {
    try {
      const payload = this.jwt.verify<TokenPayload>(token);
      return {
        accountId: payload.sub,
        email: payload.email,
        suiAddress: payload.sui_address,
      };
    } catch (err) {
      const reason = (err as Error).name === "TokenExpiredError" ? "expired" : "invalid";
      throw new ControlPlaneError("Unauthorized", `Token ${reason}`, { reason });
    }
  }
}
