import { Injectable } from "@nestjs/common";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Looks up the gateway's on-chain address from the singleton
 * `SubWallet` row written by `apps/gateway/scripts/bootstrap-gateway.ts`
 * (`role: "api_decryption"`, `account_id: null`). This is what gets
 * passed as the `api_addr` parameter to `kraterion::grant_api_access`
 * and `kraterion::create_grant_and_share_bucket` so the gateway is
 * authorized to wrap blobs into the bucket and Seal will release shares
 * to it for `seal_approve`.
 *
 * Cached in-process — the address is bootstrap-time-static. If the row
 * is missing it's a deployment error, not a user-facing one; we surface
 * it as `InternalError` so the dashboard's error UI doesn't suggest the
 * caller should retry.
 */
@Injectable()
export class GatewayAddressService {
  private cached: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<string> {
    if (this.cached) return this.cached;
    const wallet = await this.prisma.subWallet.findFirst({
      where: { role: "api_decryption", account_id: null },
      select: { sui_address: true },
    });
    if (!wallet) {
      throw new ControlPlaneError(
        "InternalError",
        "Gateway api-decryption wallet is not provisioned. Run `pnpm -F @kraterion/gateway bootstrap` first.",
      );
    }
    this.cached = wallet.sui_address;
    return this.cached;
  }
}
