import { Global, Module } from "@nestjs/common";
import { KeyWrappingService } from "./key-wrapping.service.js";
import { Sigv4VerificationService } from "./sigv4/sigv4.service.js";
import { Sigv4Guard } from "./sigv4/sigv4.guard.js";
import { GatewayKeypairService } from "./gateway-keypair.service.js";

/**
 * Auth providers — `KeyWrappingService` (env-AES wrap/unwrap),
 * `Sigv4VerificationService` (canonical request + signature math),
 * `Sigv4Guard` (the per-route enforcement point S3 controllers
 * `@UseGuards(...)` with), `GatewayKeypairService` (boot-time loaded
 * Ed25519 keypair used for every Seal SessionKey + on-chain tx).
 */
@Global()
@Module({
  providers: [
    KeyWrappingService,
    Sigv4VerificationService,
    Sigv4Guard,
    GatewayKeypairService,
  ],
  exports: [
    KeyWrappingService,
    Sigv4VerificationService,
    Sigv4Guard,
    GatewayKeypairService,
  ],
})
export class AuthModule {}
