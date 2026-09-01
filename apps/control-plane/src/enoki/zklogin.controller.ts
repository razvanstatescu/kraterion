import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { TokensService } from "../auth/tokens.service.js";
import { parseBody } from "../validation/zod-pipe.js";
import { type ZkLoginDto, zkLoginSchema } from "./dto.js";
import { ZkLoginService } from "./zklogin.service.js";

/**
 * Production sign-in endpoint. The dashboard runs the Google OAuth redirect
 * and ends up with a Google ID token; it POSTs that token here. We verify it
 * locally (`GoogleJwtService`), derive the address from our salt
 * (`jwtToAddress`), upsert the `Account`, and mint our own session JWT.
 *
 * The dev-mode endpoints in `auth.controller.ts` are still gated behind
 * `NODE_ENV !== 'production'` for tests / smoke probes.
 */
@Controller("v1/auth")
export class ZkLoginController {
  constructor(
    private readonly zklogin: ZkLoginService,
    private readonly tokens: TokensService,
  ) {}

  @Post("zklogin")
  @HttpCode(200)
  async signIn(@Body(parseBody(zkLoginSchema)) dto: ZkLoginDto) {
    const resolved = await this.zklogin.resolveOrCreate(dto.google_jwt, dto.invite_code);
    const token = this.tokens.sign({
      sub: resolved.account.id,
      email: resolved.account.email,
      sui_address: resolved.account.sui_address,
    });
    return {
      account: resolved.account,
      project: resolved.project,
      token,
      created: resolved.created,
      ...(resolved.bootstrap_api_key
        ? {
            akia: resolved.bootstrap_api_key.access_key_id,
            secret: resolved.bootstrap_api_key.secret,
            api_key_id: resolved.bootstrap_api_key.id,
            WARNING:
              "The `secret` field is shown only once. Store it now; it cannot be retrieved later.",
          }
        : {}),
    };
  }
}
