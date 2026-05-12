import { Injectable } from "@nestjs/common";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Looks up the AI worker's on-chain address from the singleton
 * `SubWallet` row written by `apps/gateway/scripts/bootstrap-gateway.ts`
 * (`role: "knowledge_indexer"`, `account_id: null`).
 *
 * Passed as the `api_addr` parameter to `kraterion::grant_api_access`
 * when a user toggles Knowledge on, so the worker is authorized to
 * register manifest blobs into the bucket via
 * `register_blob_for_bucket` + `wrap_in_shared_blob`. Mirrors the
 * gateway's `GatewayAddressService` exactly — same shape, different role.
 *
 * Cached in-process — the address is bootstrap-time-static.
 */
@Injectable()
export class KnowledgeIndexerAddressService {
  private cached: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<string> {
    if (this.cached) return this.cached;
    const wallet = await this.prisma.subWallet.findFirst({
      where: { role: "knowledge_indexer", account_id: null },
      select: { sui_address: true },
    });
    if (!wallet) {
      throw new ControlPlaneError(
        "InternalError",
        "Knowledge-indexer wallet is not provisioned. Run `pnpm -F @kraterion/gateway bootstrap` first.",
      );
    }
    this.cached = wallet.sui_address;
    return this.cached;
  }
}
