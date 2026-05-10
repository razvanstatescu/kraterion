import { Injectable, Logger } from "@nestjs/common";
import { EnokiClient, EnokiClientError } from "@mysten/enoki";
import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * Lazy wrapper around `@mysten/enoki`'s `EnokiClient`.
 *
 * Requires `ENOKI_PRIVATE_KEY` (a server-only key minted in the Enoki
 * Portal). We use the *private* key because we want to attach
 * `allowedMoveCallTargets` and `allowedAddresses` per-request — public
 * keys can't, and we don't want to rely solely on Portal-level allow-lists
 * for a multi-tenant API.
 *
 * Boot is intentionally tolerant: if the env var isn't set, the service
 * is "disabled" and any sponsored / zkLogin call surfaces a clear
 * `InternalError`. Production deployments should set the var; local
 * smoke runs without an Enoki account still let dev-auth + every
 * non-Enoki endpoint work.
 */
@Injectable()
export class EnokiClientService {
  private readonly logger = new Logger(EnokiClientService.name);
  private readonly client: EnokiClient | null;

  constructor() {
    const apiKey = process.env["ENOKI_PRIVATE_KEY"];
    if (!apiKey) {
      this.logger.warn(
        "ENOKI_PRIVATE_KEY not set — zkLogin and sponsored-tx endpoints will return 500 InternalError. Set it for production.",
      );
      this.client = null;
      return;
    }
    if (!apiKey.startsWith("enoki_private_")) {
      this.logger.warn(
        "ENOKI_PRIVATE_KEY does not look like a private key (`enoki_private_...`). Public keys cannot pass per-request allow-lists; this will likely fail at sponsorship time.",
      );
    }
    this.client = new EnokiClient({ apiKey });
    this.logger.log("EnokiClient initialized");
  }

  /**
   * Returns the underlying client. Throws `InternalError` if Enoki
   * isn't configured — preferable to a quiet 500 from inside a
   * sponsorship call.
   */
  require(): EnokiClient {
    if (!this.client) {
      throw new ControlPlaneError(
        "InternalError",
        "Enoki is not configured on this control-plane instance",
      );
    }
    return this.client;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }
}

/**
 * Translate an `EnokiClientError` into our JSON envelope. The Enoki
 * client raises 4xx as that error class with a structured `errors`
 * array — best-effort mapping by status, falling back to InternalError.
 */
export function asControlPlaneError(err: unknown, fallbackMessage: string): never {
  if (err instanceof EnokiClientError) {
    const first = err.errors[0];
    if (err.status === 400) {
      throw new ControlPlaneError("InvalidArgument", first?.message ?? fallbackMessage, {
        enoki_code: first?.code ?? "unknown",
      });
    }
    if (err.status === 401 || err.status === 403) {
      throw new ControlPlaneError("Unauthorized", first?.message ?? fallbackMessage, {
        enoki_code: first?.code ?? "unknown",
      });
    }
    if (err.status === 429) {
      throw new ControlPlaneError("RateLimited", first?.message ?? fallbackMessage, {
        enoki_code: first?.code ?? "unknown",
      });
    }
    throw new ControlPlaneError("InternalError", first?.message ?? fallbackMessage, {
      enoki_code: first?.code ?? "unknown",
      status: String(err.status),
    });
  }
  throw new ControlPlaneError("InternalError", fallbackMessage);
}
