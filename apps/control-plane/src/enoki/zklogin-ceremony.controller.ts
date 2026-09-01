import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../validation/zod-pipe.js";
import { GoogleJwtService } from "./google-jwt.service.js";
import { ProverService } from "./prover.service.js";
import { ZkLoginSaltService } from "./salt.service.js";

/**
 * Client-side zkLogin ceremony helpers (self-hosted; replaces the Enoki SDK).
 *
 * The dashboard runs the ceremony directly with `@mysten/sui/zklogin`:
 *   1. make an ephemeral keypair + randomness, compute a `nonce`,
 *   2. run Google OAuth with that nonce → Google ID token,
 *   3. `POST /v1/auth/zklogin/salt` here to fetch the user's salt,
 *   4. derive the address (`jwtToAddress`),
 *   5. `POST /v1/auth/zklogin/prove` here to get the Groth16 proof,
 *   6. assemble the zkLogin signature to sign sponsored transactions.
 *
 * Both endpoints require a valid Google ID token, verified locally.
 */
const saltSchema = z.object({ jwt: z.string().min(1) });

// The prover input is passed through to the prover-fe; we still require a jwt
// so we can authenticate the request before spending prover compute.
const proveSchema = z
  .object({
    jwt: z.string().min(1),
    extendedEphemeralPublicKey: z.string().min(1),
    maxEpoch: z.union([z.string(), z.number()]),
    jwtRandomness: z.string().min(1),
    salt: z.string().min(1),
    keyClaimName: z.string().default("sub"),
  })
  .passthrough();

@Controller("v1/auth/zklogin")
export class ZkLoginCeremonyController {
  constructor(
    private readonly googleJwt: GoogleJwtService,
    private readonly salt: ZkLoginSaltService,
    private readonly prover: ProverService,
  ) {}

  /** Return the deterministic salt for the verified user. */
  @Post("salt")
  @HttpCode(200)
  async getSalt(@Body(parseBody(saltSchema)) dto: { jwt: string }) {
    const claims = await this.googleJwt.verify(dto.jwt);
    const salt = this.salt.deriveSalt(claims.iss, claims.aud, claims.sub);
    return { salt };
  }

  /** Proxy proof generation to the internal prover after verifying the jwt. */
  @Post("prove")
  @HttpCode(200)
  async prove(@Body(parseBody(proveSchema)) dto: z.infer<typeof proveSchema>) {
    // Authenticate: the jwt must verify before we spend prover compute. We
    // also re-derive and pin the salt so a client can't request a proof for a
    // salt other than its own.
    const claims = await this.googleJwt.verify(dto.jwt);
    const salt = this.salt.deriveSalt(claims.iss, claims.aud, claims.sub);
    return this.prover.prove({ ...dto, salt, keyClaimName: "sub" });
  }
}
