import { Global, Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module.js";
import { InvitesModule } from "../invites/invites.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { GoogleJwtService } from "./google-jwt.service.js";
import { ProverService } from "./prover.service.js";
import { ZkLoginSaltService } from "./salt.service.js";
import { SponsorExecuteController } from "./sponsor-execute.controller.js";
import { SponsorshipService } from "./sponsorship.service.js";
import { ZkLoginCeremonyController } from "./zklogin-ceremony.controller.js";
import { ZkLoginController } from "./zklogin.controller.js";
import { ZkLoginService } from "./zklogin.service.js";

/**
 * Self-hosted auth + sponsorship (formerly the Enoki module). No third-party
 * Enoki dependency — zkLogin verification/derivation and gas sponsorship both
 * run in-house:
 *
 *   - `GoogleJwtService`  — local Google OIDC verification (JWKS/RS256).
 *   - `ZkLoginSaltService`— deterministic per-user salt.
 *   - `ProverService`     — proxy to the self-hosted Groth16 prover.
 *   - `ZkLoginService`    — JWT → address → account resolver.
 *   - `SponsorshipService`— sponsored-tx via our own operator gas pool.
 *   - Controllers: `POST /v1/auth/zklogin`, `/v1/auth/zklogin/{salt,prove}`,
 *     `POST /v1/sponsor/execute`.
 *
 * Marked `@Global` so `BucketsModule` can pick up `SponsorshipService`
 * without an import cycle.
 */
@Global()
@Module({
  imports: [ProjectsModule, ApiKeysModule, InvitesModule],
  controllers: [ZkLoginController, ZkLoginCeremonyController, SponsorExecuteController],
  providers: [
    GoogleJwtService,
    ZkLoginSaltService,
    ProverService,
    SponsorshipService,
    ZkLoginService,
  ],
  exports: [GoogleJwtService, ZkLoginSaltService, SponsorshipService, ZkLoginService],
})
export class EnokiModule {}
