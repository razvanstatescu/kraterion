import { Injectable, Logger } from "@nestjs/common";
import { EnvKeyWrapper, type KeyWrapper } from "./key-wrapping.js";

/**
 * Nest-injectable wrapper around `EnvKeyWrapper`. Same interface; the
 * decorator just lets controllers/services consume it via DI.
 *
 * `EnvKeyWrapper` stays as a plain class so non-Nest contexts (smoke
 * scripts, tests) can construct it directly without spinning up Nest.
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
