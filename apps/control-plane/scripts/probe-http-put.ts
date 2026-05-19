/**
 * Probe the gateway's HTTP S3 PUT path end-to-end — the path the
 * dashboard actually uses. Reads the S3 API key for a project out
 * of Prisma (unwrapped with the CP's EnvKeyWrapper), SigV4-signs
 * a request via `aws4`, and POSTs it. Reports HTTP status + first
 * 2 KiB of the response so we can see exactly what the gateway
 * returned.
 *
 * Diagnostic only — kept out of the test suite.
 *
 * Usage:
 *   pnpm -F @kraterion/control-plane exec tsx scripts/probe-http-put.ts \
 *     --project <projectId> [--bucket <name>] [--key <s3-key>]
 */
import "dotenv/config";
import aws4 from "aws4";
import { PrismaClient } from "@prisma/client";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";

interface Args {
  projectId: string;
  bucketName?: string;
  s3Key: string;
}
function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { s3Key: `audit/probe-${Date.now()}.txt` };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--project" && next) {
      out.projectId = next;
      i++;
    } else if (a === "--bucket" && next) {
      out.bucketName = next;
      i++;
    } else if (a === "--key" && next) {
      out.s3Key = next;
      i++;
    }
  }
  if (!out.projectId) {
    console.error("error: --project <id> is required");
    process.exit(1);
  }
  return out as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const bucket = await prisma.bucket.findFirst({
    where: {
      project_id: args.projectId,
      deleted_at: null,
      ...(args.bucketName ? { name: args.bucketName } : {}),
    },
    select: { name: true, kraterion_bucket_object_id: true, api_access_granted: true },
  });
  if (!bucket) throw new Error(`no bucket found for project=${args.projectId}`);

  const key = await prisma.apiKey.findFirst({
    where: {
      project_id: args.projectId,
      revoked_at: null,
      kind: "s3",
      access_key_id: { not: null },
      secret_wrapped: { not: null },
    },
    orderBy: { created_at: "desc" },
  });
  if (!key || !key.access_key_id || !key.secret_wrapped) {
    throw new Error(`no usable S3 key for project=${args.projectId}`);
  }

  const wrapper = new EnvKeyWrapper();
  const secret = wrapper.unwrap(key.secret_wrapped).toString("utf8");

  const gatewayUrl = process.env["GATEWAY_URL"] ?? "http://localhost:4002";
  const parsed = new URL(gatewayUrl);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const hostHeader = parsed.port ? `${parsed.hostname}:${port}` : parsed.hostname;
  const path = `/${encodeURIComponent(bucket.name)}/${args.s3Key
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;

  const body = Buffer.from(`probe ${new Date().toISOString()}\n`, "utf8");

  const signed = aws4.sign(
    {
      host: hostHeader,
      path,
      method: "PUT",
      service: "s3",
      region: "eu-central-1",
      headers: {
        "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
        "Content-Type": "text/plain",
        "Content-Length": String(body.length),
      },
      body: undefined,
      signQuery: false,
    },
    { accessKeyId: key.access_key_id, secretAccessKey: secret },
  );

  const url = `${parsed.protocol}//${parsed.host}${path}`;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(signed.headers ?? {})) {
    if (typeof value === "string" && name !== "Host") headers[name] = value;
  }

  console.log(`▸ PUT ${url}`);
  console.log(`  bucket=${bucket.name} api_access_granted=${bucket.api_access_granted}`);
  console.log(`  akia=${key.access_key_id}`);
  const t0 = Date.now();
  const res = await fetch(url, { method: "PUT", headers, body });
  const elapsed = Date.now() - t0;
  const respBody = await res.text();
  console.log(`◀ ${res.status} ${res.statusText} (${elapsed}ms)`);
  for (const [name, value] of res.headers) {
    if (name.startsWith("x-") || name === "content-type") {
      console.log(`  ${name}: ${value}`);
    }
  }
  if (respBody) console.log(`  body: ${respBody.slice(0, 2048)}`);

  await prisma.$disconnect();
  process.exit(res.ok ? 0 : 2);
}

main().catch(async (e) => {
  console.error(`probe failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
