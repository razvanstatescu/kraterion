import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireAccountPrincipal } from "../auth/request-context.js";
import { RunsService } from "./runs.service.js";

/**
 * P9 — Replayable Agent Runs HTTP surface.
 *
 * `GET /v1/runs/:txDigest/replay` is the developer-facing endpoint
 * the demo CLI hits (`kraterion replay <digest>`). Two modes:
 *   - verify (default) — decrypt the on-chain trace, hash-check,
 *     return the JSON.
 *   - rerun (`?rerun=true`) — additionally re-issue each captured
 *     turn against the project's OpenAI key, short-circuit tool
 *     calls with captured outputs, attach per-turn line diffs +
 *     fingerprint match status.
 *
 * Auth: session JWT or bearer API key, account-scoped. Share-token
 * principals are excluded — replay is an owner/dev surface and the
 * embed widget has no use for it.
 */
@Controller("v1/runs")
@UseGuards(AuthGuard)
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get(":txDigest/replay")
  async replay(
    @Req() req: FastifyRequest,
    @Param("txDigest") txDigest: string,
    @Query("rerun") rerun?: string,
  ) {
    const user = requireAccountPrincipal(req);
    return this.runs.verify({
      txDigest,
      accountId: user.accountId,
      rerun: rerun === "true" || rerun === "1",
    });
  }
}
