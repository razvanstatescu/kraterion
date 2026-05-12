import { Module } from "@nestjs/common";
import { AuthCoreModule } from "../auth/auth-core.module.js";
import { OAuthController } from "./oauth.controller.js";
import { OAuthService } from "./oauth.service.js";

/**
 * K3b: OAuth 2.1 + DCR + RFC 9728 issuer for the MCP `/mcp` resource.
 *
 * The MCP guard imports `OAuthService.verifyAccessToken(token, aud)`
 * to validate `eyJ`-prefixed bearer tokens.
 */
@Module({
  imports: [AuthCoreModule],
  providers: [OAuthService],
  controllers: [OAuthController],
  exports: [OAuthService],
})
export class OAuthModule {}
