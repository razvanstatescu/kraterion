import { Global, Module } from "@nestjs/common";
import { GatewayAddressService } from "./gateway-address.service.js";
import { SuiClientService } from "./sui-client.service.js";

@Global()
@Module({
  providers: [SuiClientService, GatewayAddressService],
  exports: [SuiClientService, GatewayAddressService],
})
export class SuiClientModule {}
