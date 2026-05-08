import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { KraterionBucketCreatedSchema, encryptionModeToString } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionBucketCreated` → `Bucket` row.
 *
 * Bucket creation today comes from two sources:
 *   - `bootstrap-gateway.ts` (deployer-signed) — for the test bucket.
 *   - The dashboard's zkLogin flow (post-Phase 2) — when users create
 *     their own buckets.
 *
 * Both emit the same event. We resolve `project_id` by looking up
 * `Account.sui_address = event.owner` → first project of that account.
 * If the account doesn't exist yet (timing race against the dashboard
 * creating the account row separately), we throw and the event goes
 * to the DLQ for later replay.
 *
 * The upsert is keyed on `kraterion_bucket_object_id` (the natural
 * on-chain key). On conflict — meaning the gateway-direct write
 * already populated the row — we backfill the indexer-provenance
 * columns (`tx_digest`, `event_seq`, `event_payload`) without
 * touching the rest. Once Phase 2 removes the gateway-direct write,
 * the conflict path becomes dead code.
 */
@Injectable()
export class BucketCreatedHandler implements EventHandler {
  readonly typeSuffix = "::events::KraterionBucketCreated";

  private readonly logger = new Logger(BucketCreatedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionBucketCreatedSchema.parse(event.payload);

    const account = await tx.account.findUnique({
      where: { sui_address: parsed.owner },
      select: { id: true, projects: { take: 1, select: { id: true } } },
    });
    if (!account) {
      throw new Error(
        `BucketCreatedHandler: no Account for sui_address=${parsed.owner}. ` +
          `Dashboard must create the account row before the bucket-create PTB.`,
      );
    }
    const project = account.projects[0];
    if (!project) {
      throw new Error(
        `BucketCreatedHandler: account ${account.id} has no projects. ` +
          `Cannot infer project_id for bucket ${parsed.bucket_id}.`,
      );
    }

    const name = parsed.name.toString("utf8");
    const encryption_mode = encryptionModeToString(parsed.encryption_mode);

    await tx.bucket.upsert({
      where: { kraterion_bucket_object_id: parsed.bucket_id },
      create: {
        project_id: project.id,
        name,
        encryption_mode,
        kraterion_bucket_object_id: parsed.bucket_id,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
        event_payload: event.payload as Prisma.InputJsonValue,
      },
      update: {
        // Pre-existing row (gateway-direct create). Backfill
        // indexer-provenance only; don't touch project_id / name /
        // encryption_mode — those are governed by the on-chain
        // bucket and would be re-set by their dedicated handlers
        // (visibility, etc.).
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
        event_payload: event.payload as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Bucket created: ${parsed.bucket_id} name="${name}" mode=${encryption_mode} owner=${parsed.owner}`,
    );
  }
}
