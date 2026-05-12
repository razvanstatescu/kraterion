import { Injectable, Logger } from "@nestjs/common";
import { EnvKeyWrapper, type KeyWrapper } from "./key-wrapping.js";

/**
 * Nest-injectable wrapper around `EnvKeyWrapper`. Same contract as
 * `apps/gateway/src/auth/key-wrapping.service.ts`. Both processes
 * unwrap with the same master key, so a SubWallet seed wrapped by the
 * gateway bootstrap can be loaded here.
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
