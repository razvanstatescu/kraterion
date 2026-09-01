/**
 * Exercises the REAL InvitesService against the local DB: generation,
 * validation, atomic claim, exhaustion, double-claim rejection, and
 * concurrency (N racers on a capped code). Creates + cleans up throwaway
 * accounts. Diagnostic only.
 *
 *   pnpm -F @kraterion/control-plane exec tsx scripts/probe-invites.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { InvitesService } from "../src/invites/invites.service.js";

// InvitesService only uses PrismaClient methods, so the client stands in for
// the Nest PrismaService here.
const prisma = new PrismaClient();
const svc = new InvitesService(prisma as never);

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

async function makeAccount(tag: string): Promise<string> {
  const a = await prisma.account.create({
    data: {
      email: `invite-probe-${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`,
      zklogin_sub: `probe:${tag}:${Date.now()}:${Math.round(Math.random() * 1e9)}`,
      sui_address: `0xprobe${tag}${Date.now()}${Math.round(Math.random() * 1e9)}`,
      status: "active",
    },
    select: { id: true },
  });
  return a.id;
}

async function claim(code: string, accountId: string): Promise<"ok" | "rejected"> {
  try {
    await prisma.$transaction((tx) => svc.claimWithinTx(tx, code, accountId));
    return "ok";
  } catch {
    return "rejected";
  }
}

async function main() {
  const createdAccountIds: string[] = [];
  const createdCodes: string[] = [];

  try {
    console.log("gate enabled:", svc.isEnabled());

    // --- 1. single-use code ---
    console.log("\n[1] single-use (max_claims=1)");
    const [single] = await svc.generate({ count: 1, maxClaims: 1, note: "probe-single" });
    createdCodes.push(single!.code);
    check("validate → valid, remaining 1", await isValid(single!.code, 1));

    const a1 = await makeAccount("s1");
    createdAccountIds.push(a1);
    check("first claim ok", (await claim(single!.code, a1)) === "ok");
    check("validate now invalid (exhausted)", !(await svc.validate(single!.code)).valid);

    const a2 = await makeAccount("s2");
    createdAccountIds.push(a2);
    check("second claim rejected (exhausted)", (await claim(single!.code, a2)) === "rejected");

    // --- 2. double-claim by same account ---
    console.log("\n[2] same account can't claim twice");
    const [multi] = await svc.generate({ count: 1, maxClaims: 5, note: "probe-multi" });
    createdCodes.push(multi!.code);
    const a3 = await makeAccount("d1");
    createdAccountIds.push(a3);
    check("claim #1 ok", (await claim(multi!.code, a3)) === "ok");
    check("same account re-claim rejected (unique account_id)", (await claim(multi!.code, a3)) === "rejected");

    // --- 3. invalid / disabled / bogus ---
    console.log("\n[3] invalid inputs");
    check("bogus format invalid", !(await svc.validate("not-a-code")).valid);
    check("well-formed but unknown invalid", !(await svc.validate("KRT-ZZZZZZ")).valid);
    await svc.setDisabled(multi!.code, true);
    check("disabled code invalid", !(await svc.validate(multi!.code)).valid);
    await svc.setDisabled(multi!.code, false);

    // --- 4. concurrency: cap=2, five racers ---
    console.log("\n[4] concurrency (max_claims=2, 5 racers)");
    const [capped] = await svc.generate({ count: 1, maxClaims: 2, note: "probe-race" });
    createdCodes.push(capped!.code);
    const racers = await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        const acc = await makeAccount(`r${i}`);
        createdAccountIds.push(acc);
        return claim(capped!.code, acc);
      }),
    );
    const oks = racers.filter((r) => r === "ok").length;
    const row = await prisma.inviteCode.findUnique({ where: { code: capped!.code } });
    check(`exactly 2 of 5 succeeded (got ${oks})`, oks === 2);
    check(`claim_count == 2 (got ${row?.claim_count})`, row?.claim_count === 2);
    const claimRows = await prisma.inviteClaim.count({ where: { invite_code_id: row!.id } });
    check(`2 claim rows written (got ${claimRows})`, claimRows === 2);
  } finally {
    // Cleanup: claims cascade from accounts; then remove probe codes.
    await prisma.inviteClaim.deleteMany({ where: { account_id: { in: createdAccountIds } } });
    await prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } });
    await prisma.inviteCode.deleteMany({ where: { code: { in: createdCodes } } });
    await prisma.$disconnect();
  }

  console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

async function isValid(code: string, expectRemaining: number): Promise<boolean> {
  const v = await svc.validate(code);
  return v.valid && v.remaining === expectRemaining;
}

main().catch((e) => {
  console.error("probe-invites crashed:", e);
  process.exit(1);
});
