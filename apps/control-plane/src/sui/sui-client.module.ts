import { Global, Module } from "@nestjs/common";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { GatewayAddressService } from "./gateway-address.service.js";
import { KnowledgeIndexerAddressService } from "./knowledge-indexer-address.service.js";
import { OperatorKeypairService } from "./operator-keypair.service.js";
import { SuiClientService } from "./sui-client.service.js";
import { GasPoolService } from "./gas-pool.service.js";

@Global()
@Module({
  // `OperatorKeypairService` injects `KeyWrappingService`; PrismaService
  // comes from the global PrismaModule. `GasPoolService` leases gas coins
  // (shared with the gateway process via Redis) for operator-signed txns.
  providers: [
    KeyWrappingService,
    SuiClientService,
    GatewayAddressService,
    KnowledgeIndexerAddressService,
    OperatorKeypairService,
    GasPoolService,
  ],
  exports: [
    SuiClientService,
    GatewayAddressService,
    KnowledgeIndexerAddressService,
    OperatorKeypairService,
    GasPoolService,
  ],
})
export class SuiClientModule {}
