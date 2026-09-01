import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  generateCode,
  isValidCodeFormat,
  normalizeCode,
} from "./invite-code.util.js";

/** Stable discriminators returned in `ControlPlaneError.details.reason` so the
 *  dashboard can branch (prompt for a code vs. show "code invalid"). */
export type InviteFailureReason =
  | "invite_required"
  | "invite_invalid"
  | "invite_already_claimed";

export interface InviteValidation {
  valid: boolean;
  /** Present when `valid` is false. */
  reason?: InviteFailureReason;
  message?: string;
  /** Remaining claims when valid. */
  remaining?: number;
}

/**
 * Invite gate. Kraterion is invite-only: creating an account requires
 * redeeming a valid code. Codes are generated ONLY by us (admin controller /
 * CLI) — there is no user-facing earning/referral system (that's the key
 * departure from inkray). A code carries a claim budget (`max_claims`) and the
 * claim is race-safe via a single conditional UPDATE.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether the gate is active. Enabled by default; set
   * `INVITE_SYSTEM_ENABLED=false` to open sign-up (used in local dev / tests).
   */
  isEnabled(): boolean {
    return (process.env["INVITE_SYSTEM_ENABLED"] ?? "true").toLowerCase() !== "false";
  }

  /**
   * Admin: mint `count` codes, each redeemable `maxClaims` times. Retries on
   * the unique constraint so a rare collision doesn't fail the batch.
   */
  async generate(opts: {
    count: number;
    maxClaims: number;
    note?: string | null;
    expiresAt?: Date | null;
  }): Promise<Array<{ code: string; max_claims: number; expires_at: Date | null }>> {
    const count = clampInt(opts.count, 1, 500);
    const maxClaims = clampInt(opts.maxClaims, 1, 100_000);
    const created: Array<{ code: string; max_claims: number; expires_at: Date | null }> = [];

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      // Retry only on P2002 (unique collision); other errors bubble up.
      while (true) {
        attempts++;
        try {
          const row = await this.prisma.inviteCode.create({
            data: {
              code: generateCode(),
              max_claims: maxClaims,
              note: opts.note ?? null,
              expires_at: opts.expiresAt ?? null,
            },
            select: { code: true, max_claims: true, expires_at: true },
          });
          created.push(row);
          break;
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002" &&
            attempts < 10
          ) {
            continue; // collision — try a fresh code
          }
          throw err;
        }
      }
    }
    this.logger.log(`generated ${created.length} invite code(s), max_claims=${maxClaims}`);
    return created;
  }

  /** Read-only check used by the public `validate` endpoint and pre-flight. */
  async validate(rawCode: string): Promise<InviteValidation> {
    const code = normalizeCode(rawCode);
    if (!isValidCodeFormat(code)) {
      return { valid: false, reason: "invite_invalid", message: "That code isn't in the right format." };
    }
    const row = await this.prisma.inviteCode.findUnique({ where: { code } });
    if (!row || row.disabled) {
      return { valid: false, reason: "invite_invalid", message: "That invite code isn't valid." };
    }
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
      return { valid: false, reason: "invite_invalid", message: "That invite code has expired." };
    }
    if (row.claim_count >= row.max_claims) {
      return { valid: false, reason: "invite_invalid", message: "That invite code has already been fully used." };
    }
    return { valid: true, remaining: row.max_claims - row.claim_count };
  }

  /**
   * Atomically redeem `rawCode` for `accountId`, INSIDE the caller's
   * transaction (so account creation + claim commit or roll back together).
   *
   * Race-safety: the increment is a single conditional UPDATE guarded by
   * `claim_count < max_claims`; if a concurrent sign-up already exhausted the
   * budget, our UPDATE matches 0 rows and we reject. Adapted from inkray's
   * `useInviteCode`, but wrapped in the signup transaction for true atomicity.
   *
   * Throws `ControlPlaneError` (with a `details.reason`) on any failure.
   */
  async claimWithinTx(
    tx: Prisma.TransactionClient,
    rawCode: string,
    accountId: string,
  ): Promise<void> {
    const code = normalizeCode(rawCode);
    if (!isValidCodeFormat(code)) {
      throw invalidInvite("That invite code isn't in the right format.");
    }

    const row = await tx.inviteCode.findUnique({ where: { code } });
    if (!row || row.disabled) {
      throw invalidInvite("That invite code isn't valid.");
    }
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
      throw invalidInvite("That invite code has expired.");
    }

    const now = new Date();
    const claimed = await tx.inviteCode.updateMany({
      where: {
        code,
        disabled: false,
        claim_count: { lt: row.max_claims },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      data: { claim_count: { increment: 1 } },
    });
    if (claimed.count === 0) {
      // Lost the race, or exhausted between our read and write.
      throw invalidInvite("That invite code has already been fully used.");
    }

    try {
      await tx.inviteClaim.create({
        data: { invite_code_id: row.id, account_id: accountId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // account_id is unique — this account already redeemed a code.
        throw new ControlPlaneError(
          "Conflict",
          "This account has already redeemed an invite code.",
          { reason: "invite_already_claimed" satisfies InviteFailureReason },
        );
      }
      throw err;
    }
  }

  /** Admin: list codes with claim counts, newest first. */
  async list(limit = 200): Promise<
    Array<{
      code: string;
      max_claims: number;
      claim_count: number;
      remaining: number;
      note: string | null;
      disabled: boolean;
      expires_at: Date | null;
      created_at: Date;
    }>
  > {
    const rows = await this.prisma.inviteCode.findMany({
      orderBy: { created_at: "desc" },
      take: clampInt(limit, 1, 1000),
    });
    return rows.map((r) => ({
      code: r.code,
      max_claims: r.max_claims,
      claim_count: r.claim_count,
      remaining: Math.max(0, r.max_claims - r.claim_count),
      note: r.note,
      disabled: r.disabled,
      expires_at: r.expires_at,
      created_at: r.created_at,
    }));
  }

  /** Admin: enable/disable a code (soft kill-switch; keeps claim history). */
  async setDisabled(rawCode: string, disabled: boolean): Promise<void> {
    const code = normalizeCode(rawCode);
    const res = await this.prisma.inviteCode.updateMany({
      where: { code },
      data: { disabled },
    });
    if (res.count === 0) {
      throw new ControlPlaneError("NotFound", "No invite code with that value.");
    }
  }
}

function invalidInvite(message: string): ControlPlaneError {
  return new ControlPlaneError("InvalidArgument", message, {
    reason: "invite_invalid" satisfies InviteFailureReason,
  });
}

function clampInt(n: number, min: number, max: number): number {
  const v = Math.trunc(Number.isFinite(n) ? n : min);
  return Math.max(min, Math.min(max, v));
}
