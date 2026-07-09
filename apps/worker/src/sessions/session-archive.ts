import type { Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  SEAL_THRESHOLD,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { getSealClient } from "@kraterion/seal-client";
import {
  blobIdStringToU256,
  gasStatusError,
  gasTx,
  getEncodedBlobLength,
  getSuiClient,
  getWalrusClient,
  getWriteFeeFrost,
  rootHashBytesToU256,
  signersToBitmap,
} from "@kraterion/walrus-client";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  buildSessionTrace,
  type SessionTraceInvocation,
} from "./build-session-trace.js";

/**
 * P9 — Replayable Agent Runs: archive a buffered AgentSession's trace
 * as a Seal-encrypted Walrus PooledBlob and emit
 * `KraterionSessionAnchored` so the indexer materialises
 * `AgentSessionTrace`. The on-chain tx digest is the replay handle.
 *
 * Mirrors the K5 manifest-archive flow with three differences:
 *   1. Plaintext is the canonical-JSON session trace (D3
 *      `buildSessionTrace`), gzip-skipped for v1 — Seal-encrypted
 *      directly.
 *   2. PTB1 composes BOTH `register_blob` AND `anchor_session` in a
 *      single transaction so one digest carries the
 *      `KraterionPooledBlobRegistered` AND `KraterionSessionAnchored`
 *      events. The indexer's existing pooled-blob handler writes the
 *      `PooledBlob` row from event #1; the new `SessionAnchoredHandler`
 *      (D6) reads event #2 and writes `AgentSessionTrace`.
 *   3. The reserved s3_key prefix is `_kraterion/sessions/<session_id>`;
 *      `PooledBlobRegisteredHandler`'s reserved-prefix guard is
 *      extended in D6 to skip these so they don't get routed as
 *      regular S3 objects.
 *
 * Seal envelope: identity is `bucket_uid (32) || session_uuid (16)`,
 * mirroring the S3 PutObject pattern. The trace inherits the bucket's
 * `seal_approve` policy — the project owner OR any address in
 * `bucket.api_decryption_addresses` can decrypt. The worker's
 * `knowledge_indexer` sub-wallet is on that list (added at
 * Knowledge-enable time in K2), and the replay endpoint uses the
 * same wallet via the gateway's existing `decryptObjectBytes` path.
 *
 * Idempotency:
 *   - Skip if `AgentSession.status` is already `anchored` or `failed`.
 *   - PTB1 (`register_blob` + `anchor_session`) is NOT retried in
 *     place — `register_blob` writes a unique `pooled_blob_object_id`
 *     and a second attempt aborts on the duplicate. The outer
 *     BullMQ retry policy handles re-execution after status reset.
 *   - The relay POST retries in place (same as manifest-archive)
 *     because it's the most failure-prone link on testnet.
 *
 * Authorization gates: same as manifest archival — the worker's
 * `knowledge_indexer` keypair must be on the reserve whitelist, AND
 * the project's pool vault must not be revoked (`platform_authorized`
 * = true). After user revocation, the archive fails permanently and
 * the session row stays `flushing` until the BullMQ retries exhaust;
 * we then mark `failed` with `close_reason='archive_failed'`. The
 * archive worker treats this as a final state, not an emergency.
 */
const SESSION_KEY_PREFIX = "_kraterion/sessions/";
const SESSION_CONTENT_TYPE = "application/json";
const ENCODING_TYPE_RS2 = 1;

/** Fully-qualified event type emitted by `register_blob` — we parse
 *  PTB1 effects to recover the freshly-created PooledBlob's on-chain
 *  object ID. */
const KRATERION_POOLED_BLOB_REGISTERED_TYPE =
  `${KRATERION_PACKAGE_ID}::events::KraterionPooledBlobRegistered` as const;

/** Bounded in-place retry for the relay POST. Same logic as
 *  manifest-archive: PTB1 is non-idempotent on the pool side, so we
 *  retry only the upload step. */
const RELAY_MAX_ATTEMPTS = 3;
const RELAY_BACKOFF_MS = [500, 1_500];

export type SessionCloseReason = "idle" | "size_cap" | "age_cap" | "explicit_end";

export async function archiveSessionToWalrus(args: {
  prisma: PrismaService;
  signer: Ed25519Keypair;
  logger: Logger;
  sessionId: string;
  closeReason: SessionCloseReason;
}): Promise<void> {
  const { prisma, signer, logger, sessionId, closeReason } = args;

  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    include: {
      agent: {
        include: {
          sub_wallet: { select: { sui_address: true } },
          buckets: {
            orderBy: { created_at: "asc" },
            include: {
              bucket: {
                select: {
                  id: true,
                  kraterion_bucket_object_id: true,
                  knowledge: { select: { bucket_id: true } },
                },
              },
            },
          },
        },
      },
      invocations: {
        include: {
          tool_calls: { orderBy: { created_at: "asc" } },
        },
      },
    },
  });

  if (!session) {
    logger.warn(`session-archive: session ${sessionId} not found`);
    return;
  }
  if (session.status === "anchored" || session.status === "failed") {
    logger.debug(
      `session-archive: ${sessionId} already in terminal state '${session.status}', skipping`,
    );
    return;
  }

  // Pick the agent's first knowledge-enabled attached bucket. The
  // 32-byte bucket prefix in the Seal identity binds decryption to
  // this bucket's policy. Knowledge-enabled is required because the
  // K2 wiring adds the worker's `knowledge_indexer` keypair to
  // `api_decryption_addresses`, which is what authorises both
  // archive-time encryption (identity construction) and replay-time
  // decryption.
  const sealBucket = session.agent.buckets
    .map((b) => b.bucket)
    .find((b) => b.knowledge !== null);

  if (!sealBucket) {
    logger.warn(
      `session-archive: ${sessionId} has no knowledge-enabled bucket at archive time; ` +
        `marking failed (the agent's bucket attachments changed between session-open and flush).`,
    );
    await markFailed(prisma, sessionId, "no_bucket_at_archive_time");
    return;
  }

  // Resolve the project's StoragePool (vault). The agent's project
  // must have done at least one S3 PUT (or vault-create) for this
  // row to exist; if it doesn't, the user hasn't yet provisioned the
  // pool and we can't anchor.
  const poolRow = await prisma.storagePool.findFirst({
    where: { project_id: session.project_id },
    select: { vault_object_id: true },
  });
  if (!poolRow) {
    logger.warn(
      `session-archive: ${sessionId} project=${session.project_id} has no StoragePool ` +
        `(vault never provisioned); marking failed.`,
    );
    await markFailed(prisma, sessionId, "no_pool_at_archive_time");
    return;
  }
  const vaultObjectId = poolRow.vault_object_id;

  // === Build canonical trace ===
  const traceInvocations: SessionTraceInvocation[] = session.invocations.map((inv) => ({
    id: inv.id,
    status: inv.status,
    input: inv.input,
    output: inv.output,
    model: inv.model,
    prompt_tokens: inv.prompt_tokens,
    completion_tokens: inv.completion_tokens,
    retrieval_latency_ms: inv.retrieval_latency_ms,
    llm_latency_ms: inv.llm_latency_ms,
    latency_ms: inv.latency_ms,
    cited_hashes: inv.cited_hashes.map((b) => Buffer.from(b)),
    retrieval_snapshot: inv.retrieval_snapshot,
    seed: inv.seed,
    system_fingerprint: inv.system_fingerprint,
    created_at: inv.created_at,
    finished_at: inv.finished_at,
    tool_calls: inv.tool_calls.map((tc) => ({
      tool_call_id: tc.tool_call_id,
      tool_name: tc.tool_name,
      status: tc.status,
      round: tc.round,
      arguments: tc.arguments,
      output: tc.output,
      tx_digest: tc.tx_digest,
      walrus_blob_id: tc.walrus_blob_id,
      pooled_blob_object_id: tc.pooled_blob_object_id,
      latency_ms: tc.latency_ms,
      finished_at: tc.finished_at,
    })),
  }));

  // `closed_at` and `close_reason` get baked into the canonical trace
  // even though they're only persisted on the AgentSession row after
  // PTB1 settles. The trace records the intent at archive time.
  const closedAt = new Date();
  const traceResult = buildSessionTrace({
    session: {
      id: session.id,
      opened_at: session.opened_at,
      closed_at: closedAt,
      close_reason: closeReason,
      principal_kind: session.principal_kind,
      principal_id: session.principal_id,
    },
    agent: {
      id: session.agent.id,
      sub_wallet_address: session.agent.sub_wallet.sui_address,
      system_prompt: session.agent.system_prompt,
      model: session.agent.model,
      temperature: session.agent.temperature,
      max_tokens: session.agent.max_tokens,
    },
    invocations: traceInvocations,
  });

  if (traceResult.invocationCount === 0) {
    logger.warn(
      `session-archive: ${sessionId} has 0 completed invocations; marking failed ` +
        `(nothing to anchor).`,
    );
    await markFailed(prisma, sessionId, "no_completed_invocations");
    return;
  }

  // === Seal-encrypt the canonical bytes ===
  // 48-byte identity: bucket_uid (32) || session_uuid (16). Mirrors
  // the S3 PutObject pattern so the existing `seal_approve` policy
  // gates decryption without a new Move entry.
  const sealIdentity = buildSealIdentity(sealBucket.kraterion_bucket_object_id, session.id);
  const { encryptedObject: encrypted } = await getSealClient().encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: KRATERION_PACKAGE_ID,
    id: toHex(sealIdentity),
    data: traceResult.canonicalBytes,
  });

  const s3Key = `${SESSION_KEY_PREFIX}${session.id}`;
  const etagMd5 = createHash("md5").update(encrypted).digest(); // 16 bytes

  try {
    const txDigest = await tryArchiveOnChain({
      signer,
      logger,
      sessionId,
      encrypted,
      etagMd5,
      s3Key,
      sealIdentity,
      vaultObjectId,
      traceHash: traceResult.sha256,
      agentId: session.agent.id,
      invocationCount: traceResult.invocationCount,
    });

    // The indexer (D6) writes `AgentSessionTrace` from the
    // `KraterionSessionAnchored` event. Here we just flip the parent
    // session to anchored state so the dashboard reads the new
    // status before the indexer catches up. `anchored_tx_digest` is
    // also written defensively here — the indexer would set it too,
    // but it's redundant + idempotent and lets the dashboard render
    // the Suiscan link without waiting on indexer lag.
    // The Postgres `Bytes` column for `tx_digest` follows the indexer's
    // convention: store the base58 STRING as UTF-8 bytes (see
    // `apps/worker/src/indexer/checkpoint-events.ts:digestToBuffer`).
    // The downstream lookup in `RunsService.verify` is exact-match on
    // this same encoding, so as long as it's stable, the encoding
    // choice doesn't matter — but it has to MATCH what the indexer
    // writes for `AgentSessionTrace.tx_digest`.
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        status: "anchored",
        closed_at: closedAt,
        close_reason: closeReason,
        anchored_tx_digest: Buffer.from(txDigest, "utf-8"),
      },
    });
    logger.log(
      `session-archive: ${sessionId} -> tx=${txDigest} ` +
        `invocations=${traceResult.invocationCount} bytes=${traceResult.sizeBytes} ` +
        `encrypted=${encrypted.length}`,
    );
  } catch (err) {
    logger.error(
      `session-archive: ${sessionId} failed: ${(err as Error).message}; ` +
        `marking session.status='failed'. Re-flush by resetting status='open'.`,
    );
    await markFailed(prisma, sessionId, "archive_failed");
    throw err;
  }
}

/**
 * One attempt of the on-chain anchor sequence. Throws on any failure
 * so the BullMQ outer retry policy can retry. Returns the PTB1 tx
 * digest (the replay handle).
 */
async function tryArchiveOnChain(args: {
  signer: Ed25519Keypair;
  logger: Logger;
  sessionId: string;
  encrypted: Uint8Array;
  etagMd5: Buffer;
  s3Key: string;
  sealIdentity: Uint8Array;
  vaultObjectId: string;
  traceHash: Buffer;
  agentId: string;
  invocationCount: number;
}): Promise<string> {
  const { signer, logger, sessionId, encrypted, etagMd5, s3Key, sealIdentity, vaultObjectId, traceHash, agentId, invocationCount } = args;
  const walrus = getWalrusClient();
  const suiClient = getSuiClient();

  const meta = await walrus.computeBlobMetadata({ bytes: encrypted });
  const systemState = await walrus.systemState();
  const encodedSize = getEncodedBlobLength(encrypted.length, systemState.committee.n_shards);
  const committeeSize = systemState.committee.members.length;
  const blobIdU256 = blobIdStringToU256(meta.blobId);

  // PTB1: relay tip + register_blob + anchor_session.
  // Composing all three in one tx means the same digest carries
  // both `KraterionPooledBlobRegistered` (for the PooledBlob row)
  // and `KraterionSessionAnchored` (for the AgentSessionTrace row).
  const tx1 = new Transaction();
  tx1.add(
    walrus.sendUploadRelayTip({
      size: encrypted.length,
      blobDigest: meta.blobDigest,
      nonce: meta.nonce,
    }),
  );
  tx1.add(
    pool_vault.registerBlob({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        vault: vaultObjectId,
        reserve: KRATERION_RESERVE_ID,
        system: WALRUS_SYSTEM_OBJECT_ID,
        blobId: blobIdU256,
        rootHash: rootHashBytesToU256(meta.rootHash),
        unencodedSize: BigInt(encrypted.length),
        encodingType: ENCODING_TYPE_RS2,
        s3Key: Array.from(new TextEncoder().encode(s3Key)),
        contentType: Array.from(new TextEncoder().encode(SESSION_CONTENT_TYPE)),
        sealIdentity: Array.from(sealIdentity),
        sizeBytes: BigInt(encrypted.length),
        etagMd5: Array.from(etagMd5),
        paymentBudgetFrost: getWriteFeeFrost(encodedSize),
      },
    }),
  );
  tx1.add(
    pool_vault.anchorSession({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        vault: vaultObjectId,
        reserve: KRATERION_RESERVE_ID,
        blobId: blobIdU256,
        sealIdentity: Array.from(sealIdentity),
        traceHash: Array.from(traceHash),
        sessionId: Array.from(uuidToBytes16(sessionId)),
        agentId: Array.from(uuidToBytes16(agentId)),
        invocationCount,
      },
    }),
  );

  const r1 = gasTx(
    await suiClient.signAndExecuteTransaction({
      transaction: tx1,
      signer,
      include: { effects: true, events: true },
    }),
  );
  if (!r1.effects.status.success) {
    throw new Error(
      `pool_vault PTB1 (register+anchor) reverted: ${gasStatusError(r1)}`,
    );
  }
  const pooledBlobObjectId = pickPooledBlobObjectIdFromEvents(r1.events ?? [], blobIdU256);
  if (!pooledBlobObjectId) {
    throw new Error("PTB1 settled but KraterionPooledBlobRegistered event missing");
  }

  // Relay upload — same retry pattern as manifest-archive.
  let certificate;
  {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= RELAY_MAX_ATTEMPTS; attempt++) {
      try {
        const relayResult = await walrus.writeBlobToUploadRelay({
          blob: encrypted,
          blobId: meta.blobId,
          nonce: meta.nonce,
          txDigest: r1.digest,
          blobObjectId: pooledBlobObjectId,
          deletable: true,
        });
        certificate = relayResult.certificate;
        if (attempt > 1) {
          logger.log(
            `session-archive: relay POST succeeded on attempt ${attempt}/${RELAY_MAX_ATTEMPTS} ` +
              `(session=${sessionId}, pooled=${pooledBlobObjectId})`,
          );
        }
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < RELAY_MAX_ATTEMPTS) {
          logger.warn(
            `session-archive: relay POST attempt ${attempt}/${RELAY_MAX_ATTEMPTS} ` +
              `failed (session=${sessionId}): ${(e as Error).message}`,
          );
          await sleep(RELAY_BACKOFF_MS[attempt - 1] ?? 1_500);
        }
      }
    }
    if (!certificate) {
      throw new Error(
        `session relay POST failed after ${RELAY_MAX_ATTEMPTS} attempts ` +
          `(orphan pooled_blob_object_id=${pooledBlobObjectId}): ${(lastErr as Error).message}`,
      );
    }
  }
  const signersBitmap = signersToBitmap(certificate.signers, committeeSize);

  // PTB2: certify_blob.
  const tx2 = new Transaction();
  tx2.add(
    pool_vault.certifyBlob({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        vault: vaultObjectId,
        reserve: KRATERION_RESERVE_ID,
        system: WALRUS_SYSTEM_OBJECT_ID,
        blobId: blobIdU256,
        signature: Array.from(certificate.signature),
        signersBitmap: Array.from(signersBitmap),
        message: Array.from(certificate.serializedMessage),
      },
    }),
  );

  const r2 = gasTx(
    await suiClient.signAndExecuteTransaction({
      transaction: tx2,
      signer,
      include: { effects: true },
    }),
  );
  if (!r2.effects.status.success) {
    throw new Error(`pool_vault::certify_blob reverted: ${gasStatusError(r2)}`);
  }

  return r1.digest;
}

async function markFailed(
  prisma: PrismaService,
  sessionId: string,
  reason: string,
): Promise<void> {
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: {
      status: "failed",
      close_reason: reason,
      closed_at: new Date(),
    },
  });
}

function pickPooledBlobObjectIdFromEvents(
  events: ReadonlyArray<{ eventType?: string; json?: Record<string, unknown> | null }>,
  blobId: bigint,
): string | null {
  for (const ev of events) {
    // Core-API events: `eventType` is the full `0xpkg::module::Struct`
    // string and `json` is the already-deserialized Move struct (flat).
    if (ev.eventType !== KRATERION_POOLED_BLOB_REGISTERED_TYPE) continue;
    const json = ev.json;
    if (!json) continue;
    const evBlobId = json["walrus_blob_id"];
    if (typeof evBlobId === "string" && BigInt(evBlobId) === blobId) {
      const oid = json["pooled_blob_object_id"];
      if (typeof oid === "string") return oid;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 48-byte Seal IBE identity = bucket_uid (32) || session_uuid (16).
 *  Mirrors the S3 PutObject and K5 manifest patterns so the existing
 *  `kraterion::access::seal_approve` policy gates decryption — the
 *  bucket UID prefix is what the Move check matches on. */
function buildSealIdentity(bucketObjectId: string, sessionId: string): Uint8Array {
  const out = new Uint8Array(48);
  const bucketBytes = Buffer.from(bucketObjectId.replace(/^0x/, ""), "hex");
  out.set(bucketBytes.subarray(0, 32), 0);
  out.set(uuidToBytes16(sessionId), 32);
  return out;
}

/** Pack a hyphenated UUID into 16 bytes. Defensive on unexpected
 *  formats (e.g. older non-dashed UUIDs that may exist in seed data). */
function uuidToBytes16(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex.padEnd(32, "0").slice(0, 32), "hex").subarray(0, 16);
}
