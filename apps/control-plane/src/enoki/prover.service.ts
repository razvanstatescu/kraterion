import { Injectable } from "@nestjs/common";
import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * Thin proxy to our self-hosted zkLogin proving service (`prover-fe`).
 *
 * The browser generates the proof inputs (jwt, ephemeral pubkey, maxEpoch,
 * randomness, salt) and needs a Groth16 proof back. Rather than expose the
 * prover to the public internet, the dashboard POSTs the inputs here and we
 * forward them to the internal prover URL (`ZKLOGIN_PROVER_URL`, e.g.
 * `http://zklogin-prover-fe:8080/v1`).
 */
@Injectable()
export class ProverService {
  private url(): string {
    const url = process.env["ZKLOGIN_PROVER_URL"];
    if (!url) {
      throw new ControlPlaneError(
        "InternalError",
        "ZKLOGIN_PROVER_URL is not configured; the zkLogin prover is unavailable.",
      );
    }
    return url;
  }

  /** Forward proof inputs to the prover-fe and return its proof response. */
  async prove(input: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(this.url(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch (err) {
      throw new ControlPlaneError(
        "InternalError",
        `Could not reach the zkLogin prover: ${(err as Error).message}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `zkLogin prover rejected the request (${res.status}): ${text.slice(0, 400)}`,
        { reason: "prover-error", status: String(res.status) },
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ControlPlaneError("InternalError", "zkLogin prover returned non-JSON");
    }
  }
}
