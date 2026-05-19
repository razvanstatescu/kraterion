import { Global, Module } from "@nestjs/common";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { GatewayAddressService } from "./gateway-address.service.js";
import { KnowledgeIndexerAddressService } from "./knowledge-indexer-address.service.js";
import { OperatorKeypairService } from "./operator-keypair.service.js";
import { SuiClientService } from "./sui-client.service.js";

@Global()
@Module({
  // `OperatorKeypairService` injects `KeyWrappingService`; PrismaService
  // comes from the global PrismaModule.
  providers: [
    KeyWrappingService,
    SuiClientService,
    GatewayAddressService,
    KnowledgeIndexerAddressService,
    OperatorKeypairService,
  ],
  exports: [
    SuiClientService,
    GatewayAddressService,
    KnowledgeIndexerAddressService,
    OperatorKeypairService,
  ],
})
export class SuiClientModule {}
