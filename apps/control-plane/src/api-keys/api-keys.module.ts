import { Module } from "@nestjs/common";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { ApiKeysController } from "./api-keys.controller.js";
import { ApiKeysService } from "./api-keys.service.js";

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, KeyWrappingService],
  exports: [ApiKeysService, KeyWrappingService],
})
export class ApiKeysModule {}
