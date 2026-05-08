import { Injectable, Logger } from "@nestjs/common";
import { EnvKeyWrapper, type KeyWrapper } from "./key-wrapping.js";

/**
 * Nest-injectable wrapper around `EnvKeyWrapper`. Same interface; the
 * decorator just lets controllers/services consume it via DI.
 *
 * `EnvKeyWrapper` stays as a plain class (in `./key-wrapping.ts`) so
 * non-Nest contexts — `bootstrap-gateway.ts`, `smoke-encrypt-roundtrip.ts`
 * — can construct it directly without spinning up the Nest container.
 *
 * When we eventually swap to AWS KMS post-hackathon, replace
 * `new EnvKeyWrapper()` with `new AwsKmsWrapper(...)`. Same `KeyWrapper`
 * interface; nothing else moves.
 */
@Injectable()
export class KeyWrappingService implements KeyWrapper {
  private readonly logger = new Logger(KeyWrappingService.name);
  private readonly wrapper: KeyWrapper;

  constructor() {
    this.wrapper = new EnvKeyWrapper();
    this.logger.log("KeyWrappingService initialized (EnvKeyWrapper)");
  }

  wrap(plaintext: Uint8Array): Buffer {
    return this.wrapper.wrap(plaintext);
  }

  unwrap(wrapped: Uint8Array): Buffer {
    return this.wrapper.unwrap(wrapped);
  }
}
