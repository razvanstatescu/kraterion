/**
 * Print the latest non-revoked S3 access key + secret for a given
 * project to stdout, tab-separated. Used by the boto3 conformance
 * test script (which can't unwrap `secret_wrapped` itself).
 *
 *   pnpm -F @kraterion/control-plane exec tsx scripts/print-s3-creds.ts <projectId>
 *
 * Output is one line: `<akia>\t<secret>`. Stderr stays empty on
 * success — caller can pipe stdout straight through.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("usage: print-s3-creds.ts <projectId>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const key = await prisma.apiKey.findFirst({
    where: {
      project_id: projectId,
      revoked_at: null,
      kind: "s3",
      access_key_id: { not: null },
      secret_wrapped: { not: null },
    },
    orderBy: { created_at: "desc" },
  });
  if (!key || !key.access_key_id || !key.secret_wrapped) {
    console.error(`no usable S3 key for project=${projectId}`);
    process.exit(1);
  }
  const secret = new EnvKeyWrapper().unwrap(key.secret_wrapped).toString("utf8");
  process.stdout.write(`${key.access_key_id}\t${secret}\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(`failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
