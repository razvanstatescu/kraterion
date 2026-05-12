import { Global, Module } from "@nestjs/common";
import { GatewayAddressService } from "./gateway-address.service.js";
import { KnowledgeIndexerAddressService } from "./knowledge-indexer-address.service.js";
import { SuiClientService } from "./sui-client.service.js";

@Global()
@Module({
  providers: [SuiClientService, GatewayAddressService, KnowledgeIndexerAddressService],
  exports: [SuiClientService, GatewayAddressService, KnowledgeIndexerAddressService],
})
export class SuiClientModule {}
