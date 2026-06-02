import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Redis } from "ioredis";
import { access } from "@kraterion/kraterion-move-sdk";
import { getOrCreateSessionKey, getSealClient } from "@kraterion/seal-client";
import { KRATERION_PACKAGE_ID } from "@kraterion/shared";
import { getSuiClient, readBlobByBlobId } from "@kraterion/walrus-client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProviderCredentialService } from "../providers/provider-credential.service.js";
import { REDIS } from "../redis/redis.module.js";
import { OperatorKeypairService } from "../sui/operator-keypair.service.js";
import { replaySession, type CapturedTurn, type ReplayTurnResult } from "./replay.js";
import {
  buildLineage,
  type OpenLineageEnvelope,
  type SessionTraceJson,
} from "./build-lineage.js";

/**
 * P9 — Replayable Agent Runs (read side).
 *
 * Resolves a Sui tx digest to its anchored AgentSession trace:
 *   1. Postgres lookup on `AgentSessionTrace` by `tx_digest` (the
 *      indexer wrote this from `KraterionSessionAnchored`).
 *   2. Authorization check: trace's project belongs to the requesting
 *      account.
 *   3. SessionKey from the control-plane's `api_decryption` sub-wallet
 *      (the address already present in every knowledge-enabled
 *      bucket's `api_decryption_addresses`).
 *   4. Read ciphertext from Walrus + Seal decrypt via the existing
 *      `decryptObjectBytes` pipeline.
 *   5. Hash-check: sha256(plaintext) must equal the on-chain
 *      `trace_hash`. Mismatch means tamper.
 *   6. Parse + return the canonical JSON.
 *
 * The endpoint deliberately depends on the indexer being caught up
 * (we look up by `tx_digest` not by querying Sui directly). The
 * trade-off is simplicity vs. a 6-30s lag after the worker anchors.
 * The "still indexing" path returns 425 so the CLI can poll briefly.
 *
 * Re-execution (LLM rerun + diff) is layered on D10/D11 by a
 * separate method on this service.
 */
@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly operator: OperatorKeypairService,
    private readonly credentials: ProviderCredentialService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Verify-mode replay. Returns the decrypted trace JSON, the hash
   * comparison result, and a small envelope of metadata for the CLI
   * to render.
   *
   * Authorization: principal's accountId must match the trace's
   * project.account_id. We surface 404 (not 403) on a mismatch so
   * the existence of a tx digest can't be used to enumerate
   * project IDs.
   */
  async verify(args: {
    txDigest: string;
    accountId: string;
    /** P9 (D11) — when true, re-execute each captured turn against
     *  OpenAI and attach per-turn diffs alongside the trace. */
    rerun?: boolean;
  }): Promise<{
    tx_digest: string;
    session_id: string;
    agent_id: string;
    project_id: string;
    invocation_count: number;
    anchored_at: string;
    walrus_blob_id: string;
    trace_hash_hex: string;
    trace_hash_matches: boolean;
    trace: unknown;
    /** Set only when `rerun: true`. One entry per captured turn,
     *  ordered. Includes captured vs replay output, fingerprint match
     *  status, and a per-line diff summary. */
    replay?: ReplayResult;
  }> {
    const digestBytes = parseTxDigest(args.txDigest);

    // Trace row first; falls back to the session row to distinguish
    // "still indexing" from "not found".
    const trace = await this.prisma.agentSessionTrace.findFirst({
      where: { tx_digest: digestBytes },
      include: {
        session: {
          include: {
            agent: {
              include: {
                project: { select: { id: true, account_id: true } },
              },
            },
          },
        },
        pooled_blob: { select: { status: true, walrus_blob_id: true } },
      },
    });

    if (!trace) {
      // Maybe the session anchored but the indexer hasn't caught up?
      const pendingSession = await this.prisma.agentSession.findFirst({
        where: { anchored_tx_digest: digestBytes },
        select: { id: true },
      });
      if (pendingSession) {
        throw new ControlPlaneError(
          "PreconditionFailed",
          "Run anchored on chain but the trace isn't indexed yet. Try again in ~30s.",
          { tx_digest: bytesToBase58String(digestBytes) },
        );
      }
      throw new ControlPlaneError("NotFound", "Run not found for this transaction digest.");
    }

    if (trace.session.agent.project.account_id !== args.accountId) {
      throw new ControlPlaneError("NotFound", "Run not found for this transaction digest.");
    }

    if (trace.pooled_blob.status !== "certified") {
      throw new ControlPlaneError(
        "PreconditionFailed",
        `Walrus blob not yet certified (status=${trace.pooled_blob.status}); try again in ~10s.`,
      );
    }

    // === Decrypt ===
    // 32-byte bucket prefix on the seal_identity gives us the bucket
    // object id without an extra event/DB field.
    if (trace.seal_identity.length < 32) {
      throw new Error(
        `Internal: seal_identity too short (${trace.seal_identity.length})`,
      );
    }
    const bucketObjectId = "0x" + trace.seal_identity.subarray(0, 32).toString("hex");

    const sessionKey = await getOrCreateSessionKey({
      accountKey: "control_plane_replay",
      signer: this.operator.getKeypair() as unknown as Ed25519Keypair,
      redis: this.redis,
    });

    // Inlined Seal decrypt pipeline. The same three steps live in
    // `@kraterion/object-bytes` (worker uses that wrapper) — control-plane
    // doesn't depend on that package, so we open-code them here against
    // the SDK deps the control-plane already pulls in.
    const sealApproveTx = new Transaction();
    sealApproveTx.add(
      access.sealApprove({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          id: Array.from(trace.seal_identity),
          bucket: bucketObjectId,
        },
      }),
    );
    sealApproveTx.setSender(sessionKey.getAddress());
    const txBytes = await sealApproveTx.build({
      client: getSuiClient(),
      onlyTransactionKind: true,
    });

    let encrypted: Uint8Array;
    try {
      encrypted = await readBlobByBlobId(trace.walrus_blob_id);
    } catch (err) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        `Walrus aggregator could not return the trace bytes: ${
          err instanceof Error ? err.message : String(err)
        }. Retry in a few seconds.`,
      );
    }

    let plaintext: Uint8Array;
    try {
      plaintext = await getSealClient().decrypt({
        data: encrypted,
        sessionKey,
        txBytes,
      });
    } catch (err) {
      throw new ControlPlaneError(
        "Forbidden",
        `Seal decrypt rejected — the bucket policy may have been revoked: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // === Hash check ===
    const computedHash = createHash("sha256").update(plaintext).digest();
    const traceHashMatches = computedHash.equals(trace.trace_hash);
    if (!traceHashMatches) {
      this.logger.error(
        `trace_hash mismatch for session=${trace.session_id}: ` +
          `chain=${trace.trace_hash.toString("hex")} ` +
          `computed=${computedHash.toString("hex")}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(plaintext).toString("utf-8"));
    } catch (err) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        `Trace plaintext is not valid JSON: ${(err as Error).message}`,
      );
    }

    let replay: ReplayResult | undefined;
    if (args.rerun) {
      replay = await this.runReplay({
        projectId: trace.project_id,
        traceJson: parsed,
      });
    }

    return {
      tx_digest: bytesToBase58String(digestBytes),
      session_id: trace.session_id,
      agent_id: trace.session.agent.id,
      project_id: trace.project_id,
      invocation_count: trace.invocation_count,
      anchored_at: trace.anchored_at.toISOString(),
      walrus_blob_id: trace.walrus_blob_id,
      trace_hash_hex: trace.trace_hash.toString("hex"),
      trace_hash_matches: traceHashMatches,
      trace: parsed,
      ...(replay ? { replay } : {}),
    };
  }

  /**
   * P9 Feature 2 — Lineage view. Resolves a tx digest to the
   * OpenLineage envelope (Jobs / Runs / Datasets) derived from the
   * same canonical trace `verify()` already decrypts. Cheap second
   * hop over verify (no rerun) — the decrypt + hash check is what
   * dominates latency; the transformer is pure.
   */
  async lineage(args: {
    txDigest: string;
    accountId: string;
  }): Promise<OpenLineageEnvelope> {
    const verified = await this.verify({
      txDigest: args.txDigest,
      accountId: args.accountId,
    });
    // The trace.session.agent.project.account_id check already happened
    // inside verify(); we don't need to re-authorize here. The trace
    // field shape matches `SessionTraceJson` because build-session-trace
    // and build-lineage agree on the canonical schema.
    return buildLineage({
      trace: verified.trace as SessionTraceJson,
      anchored_tx_digest: verified.tx_digest,
      trace_hash_hex: verified.trace_hash_hex,
    });
  }

  /** Re-issue each captured turn against the project's OpenAI key. */
  private async runReplay(args: {
    projectId: string;
    traceJson: unknown;
  }): Promise<ReplayResult> {
    const traceObj = args.traceJson as Record<string, unknown>;
    const invocations = (traceObj["invocations"] ?? []) as CapturedTurn[];
    if (invocations.length === 0) {
      return { turns: [], any_output_differs: false, any_fingerprint_mismatch: false };
    }
    const agentObj = traceObj["agent"] as Record<string, unknown> | undefined;
    const systemPromptHash = (agentObj?.["system_prompt_hash"] as string) ?? "";

    const turns: ReplayTurnResult[] = await this.credentials.useDecrypted(
      args.projectId,
      "openai",
      (apiKey) => replaySession(invocations, systemPromptHash, { apiKey }),
    );

    const enriched = turns.map(annotateTurnWithDiff);
    return {
      turns: enriched,
      any_output_differs: enriched.some((t) => t.diff.differs),
      any_fingerprint_mismatch: enriched.some(
        (t) => !t.system_fingerprint_matched,
      ),
    };
  }
}

export interface ReplayResult {
  turns: AnnotatedReplayTurn[];
  any_output_differs: boolean;
  any_fingerprint_mismatch: boolean;
}

export interface AnnotatedReplayTurn extends ReplayTurnResult {
  diff: { differs: boolean; lines: DiffLine[] };
}

export interface DiffLine {
  /** "equal" | "captured" (in captured only) | "replay" (in replay only). */
  kind: "equal" | "captured" | "replay";
  text: string;
}

/** Tiny line-level diff over per-turn outputs. Produces a structured
 *  array the CLI/dashboard can render side-by-side. Uses a basic LCS
 *  approach — fine for the per-turn output sizes we care about
 *  (typically <10 KB). */
function annotateTurnWithDiff(turn: ReplayTurnResult): AnnotatedReplayTurn {
  const a = (turn.captured_output ?? "").split("\n");
  const b = (turn.replay_output ?? "").split("\n");
  const lines = lcsDiff(a, b);
  const differs = lines.some((l) => l.kind !== "equal");
  return { ...turn, diff: { differs, lines } };
}

function lcsDiff(a: string[], b: string[]): DiffLine[] {
  // Build LCS length matrix; backtrack for diff.
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0) as number[],
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const cellRight = dp[i]?.[j + 1] ?? 0;
      const cellDown = dp[i + 1]?.[j] ?? 0;
      const cellDiag = dp[i + 1]?.[j + 1] ?? 0;
      dp[i]![j] = a[i] === b[j] ? cellDiag + 1 : Math.max(cellRight, cellDown);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "equal", text: a[i] as string });
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      out.push({ kind: "captured", text: a[i] as string });
      i++;
    } else {
      out.push({ kind: "replay", text: b[j] as string });
      j++;
    }
  }
  while (i < m) out.push({ kind: "captured", text: a[i++] as string });
  while (j < n) out.push({ kind: "replay", text: b[j++] as string });
  return out;
}

/** Accept Sui transaction digests in their canonical base58 form (what
 *  Suiscan and `sui client tx-block` show, e.g.
 *  `HNtDY2ek5bbFFqYxHu7Cadxi48Zr1MdXu1S1QsoHM99W`).
 *
 *  Storage convention: the Postgres `Bytes` column stores the base58
 *  STRING as UTF-8 bytes, not the 32 raw bytes the digest represents.
 *  This matches what the indexer writes
 *  (`apps/worker/src/indexer/checkpoint-events.ts:digestToBuffer`) and
 *  what the worker writes in `session-archive.ts`. The lookup is an
 *  exact-match `WHERE tx_digest = ?`, so as long as both sides agree
 *  on the encoding, the choice doesn't matter — but it has to match.
 */
function parseTxDigest(input: string): Buffer {
  // Base58: ~43-44 chars from base58btc alphabet.
  if (/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(input)) {
    return Buffer.from(input, "utf-8");
  }
  throw new ControlPlaneError(
    "InvalidArgument",
    "Transaction digest must be a Sui base58 string (~43-44 chars).",
    { received: input.slice(0, 16) + "…" },
  );
}

function bytesToBase58String(buf: Buffer): string {
  // Buffer holds the UTF-8 bytes of the base58 string already.
  return buf.toString("utf-8");
}
