/**
 * Admin endpoints — manual storage-pool ops and reserve introspection.
 *
 * All routes sit behind `AuthGuard` + `AdminGuard`: the first attaches a
 * principal, the second checks it's a SessionPrincipal with an email on
 * the `ADMIN_EMAILS` allowlist. v1 has no on-chain admin role; mainnet
 * may swap the guard for a Move-cap check without touching this file.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { AdminGuard } from "./admin.guard.js";
import { AdminService } from "./admin.service.js";

@Controller("admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("pools")
  async listPools() {
    return { pools: await this.admin.listPools() };
  }

  @Get("pools/:id")
  async getPool(@Param("id") id: string) {
    return await this.admin.getPool(id);
  }

  /**
   * Extend a pool's end_epoch by `epochs` (1..53). WAL pulled from the
   * platform reserve via `pool_vault::extend`. Returns the tx digest.
   *
   * Query string: `?epochs=N`.
   */
  @Post("pools/:id/extend")
  @HttpCode(200)
  async extendPool(@Param("id") id: string, @Query("epochs") epochs: string) {
    const n = parseIntStrict(epochs, "epochs");
    return await this.admin.extendPool(id, n);
  }

  /**
   * Grow a pool's reserved capacity by `additional_bytes`. WAL pulled
   * from the platform reserve via `pool_vault::resize_grow`. Returns
   * the tx digest.
   *
   * Body: `{ "additional_bytes": "<decimal string>" }` — string-typed
   * because the value is u64 and JSON doesn't represent large integers
   * losslessly.
   */
  @Post("pools/:id/resize-grow")
  @HttpCode(200)
  async resizeGrow(
    @Param("id") id: string,
    @Body() body: { additional_bytes?: string },
  ) {
    if (!body?.additional_bytes) {
      throw new Error("Missing body field: additional_bytes (decimal string).");
    }
    let bytes: bigint;
    try {
      bytes = BigInt(body.additional_bytes);
    } catch {
      throw new Error("additional_bytes must parse as BigInt.");
    }
    return await this.admin.resizeGrow(id, bytes);
  }

  @Get("reserve")
  async getReserve() {
    return await this.admin.getReserve();
  }
}

function parseIntStrict(raw: string | undefined, name: string): number {
  if (raw === undefined || raw === "") {
    throw new Error(`Missing query param: ${name}`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new Error(`${name} must be an integer (got "${raw}").`);
  }
  return n;
}
