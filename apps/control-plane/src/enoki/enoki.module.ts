import { Global, Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { EnokiClientService } from "./enoki-client.service.js";
import { SponsorExecuteController } from "./sponsor-execute.controller.js";
import { SponsorshipService } from "./sponsorship.service.js";
import { ZkLoginController } from "./zklogin.controller.js";
import { ZkLoginService } from "./zklogin.service.js";

/**
 * Houses everything that touches the Enoki API:
 *   - `EnokiClientService` — lazy `EnokiClient` wrapper.
 *   - `SponsorshipService` — sponsored-tx orchestration. Used by
 *     `PrepareTxService` (in BucketsModule) and the execute relay
 *     controller below.
 *   - `ZkLoginService` — JWT-to-account resolver.
 *   - `ZkLoginController` — `POST /v1/auth/zklogin`.
 *   - `SponsorExecuteController` — `POST /v1/sponsor/execute`.
 *
 * Marked `@Global` so `BucketsModule` can pick up `SponsorshipService`
 * without an import cycle.
 */
@Global()
@Module({
  imports: [ProjectsModule, ApiKeysModule],
  controllers: [ZkLoginController, SponsorExecuteController],
  providers: [EnokiClientService, SponsorshipService, ZkLoginService],
  exports: [EnokiClientService, SponsorshipService, ZkLoginService],
})
export class EnokiModule {}
