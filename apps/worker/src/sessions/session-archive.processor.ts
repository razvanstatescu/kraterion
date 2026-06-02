import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PrismaService } from "../prisma/prisma.service.js";
import { KnowledgeIndexerKeypairService } from "../auth/knowledge-indexer-keypair.service.js";
import { archiveSessionToWalrus } from "./session-archive.js";
import {
  SESSION_ARCHIVE_QUEUE,
  type SessionArchiveJobData,
} from "./session-archive.service.js";

/**
 * BullMQ processor for the `kraterion-session-archive` queue.
 *
 * Per-job sequence:
 *   1. Load AgentSession + invocations + tool_calls + agent + first
 *      knowledge-enabled bucket attached to the agent.
 *   2. Build the canonical-JSON trace (D3 `buildSessionTrace`).
 *   3. Seal-encrypt the canonical bytes with identity
 *      `bucket_uid (32) || session_uuid (16)`.
 *   4. PTB1: relay tip + `pool_vault::register_blob` +
 *      `pool_vault::anchor_session`. Two events, one digest.
 *   5. Relay upload (with bounded in-place retry).
 *   6. PTB2: `pool_vault::certify_blob`.
 *   7. Patch AgentSession.status='anchored' + close_reason +
 *      anchored_tx_digest. The indexer's SessionAnchoredHandler (D6)
 *      writes the actual AgentSessionTrace row from the on-chain
 *      event.
 *
 * Concurrency: capped at 2. The Walrus relay + Sui RPC are the
 * bottlenecks (~5-10s per archive); two concurrent archives stay
 * well within Walrus's per-publisher rate limit on testnet.
 */
@Processor(SESSION_ARCHIVE_QUEUE, { concurrency: 2 })
export class SessionArchiveProcessor extends WorkerHost {
  private readonly logger = new Logger(SessionArchiveProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keypair: KnowledgeIndexerKeypairService,
  ) {
    super();
  }

  async process(job: Job<SessionArchiveJobData>): Promise<{ status: string }> {
    const { session_id, close_reason } = job.data;
    this.logger.log(
      `session-archive: processing session=${session_id} reason=${close_reason} ` +
        `attempt=${job.attemptsMade + 1}`,
    );

    await archiveSessionToWalrus({
      prisma: this.prisma,
      signer: this.keypair.getKeypair() as unknown as Ed25519Keypair,
      logger: this.logger,
      sessionId: session_id,
      closeReason: close_reason,
    });

    return { status: "anchored" };
  }
}
