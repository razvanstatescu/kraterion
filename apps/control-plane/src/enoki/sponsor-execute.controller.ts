import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { parseBody } from "../validation/zod-pipe.js";
import { type ExecuteSponsoredDto, executeSponsoredSchema } from "./dto.js";
import { SponsorshipService } from "./sponsorship.service.js";

/**
 * Relay endpoint for sponsored-tx execution.
 *
 * The dashboard (a) fetches a sponsored tx via `POST /v1/buckets/prepare-*`,
 * (b) signs the returned `bytes` with its zkLogin key,
 * (c) calls this endpoint with `{ digest, signature }` to settle.
 *
 * We don't re-validate the move-call target here — the sponsored bytes were
 * built and stashed by us at create time (keyed by digest), so the client
 * can only supply a signature over a transaction we already authorized.
 */
@Controller("v1/sponsor")
@UseGuards(AuthGuard)
export class SponsorExecuteController {
  constructor(private readonly sponsorship: SponsorshipService) {}

  @Post("execute")
  @HttpCode(200)
  async execute(@Body(parseBody(executeSponsoredSchema)) dto: ExecuteSponsoredDto) {
    const result = await this.sponsorship.executeSponsored({
      digest: dto.digest,
      signature: dto.signature,
    });
    return { digest: result.digest };
  }
}
