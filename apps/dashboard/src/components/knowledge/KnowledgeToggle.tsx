"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { env } from "@/lib/env";
import { suiscanTxUrl } from "@/lib/format";
import { useToggleKnowledge, type KnowledgeStatus } from "@/lib/queries";
import { useSponsoredTx } from "@/lib/sponsor";

interface Props {
  bucketId: string;
  status: KnowledgeStatus;
}

/**
 * Enable / disable card for Knowledge on a single bucket. On enable
 * the worker backfills every existing object; on disable the CP
 * deletes every chunk and the settings row (the manifests stay for
 * audit but become orphaned).
 */
export function KnowledgeToggle({ bucketId, status }: Props) {
  const toggle = useToggleKnowledge(bucketId);
  const runSponsored = useSponsoredTx();
  const { show } = useToast();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [granting, setGranting] = useState(false);

  const onEnable = async () => {
    try {
      const res = await toggle.mutateAsync(true);
      // First step done — settings row written, backfill enqueued.
      show({
        tone: "success",
        title: "Knowledge enabled",
        body:
          res.backfilled_objects && res.backfilled_objects > 0
            ? `Queued ${res.backfilled_objects} object${res.backfilled_objects === 1 ? "" : "s"} for indexing.`
            : "New uploads will be indexed automatically.",
      });

      // K5: ask the user to grant the worker's `knowledge_indexer`
      // sub-wallet access to this bucket so future manifest blobs are
      // bucket-owned on chain. Sponsored tx — the user signs but pays
      // nothing. Skipped when the address is already on the bucket's
      // `api_decryption_addresses` list (the CP checks on chain before
      // returning `needs_indexer_grant`).
      if (res.needs_indexer_grant && res.indexer_address) {
        setGranting(true);
        try {
          const grant = await runSponsored({
            prepareEndpoint: `/v1/buckets/${bucketId}/prepare-grant-api`,
            body: { api_addr_override: res.indexer_address },
          });
          show({
            tone: "success",
            title: "Indexer access granted",
            body: (
              <>
                Future indexing manifests will be archived as
                bucket-owned SharedBlobs.{" "}
                <a
                  href={suiscanTxUrl(grant.digest, env.network)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on-chain
                </a>
              </>
            ),
          });
        } catch (err) {
          show({
            tone: "warning",
            title: "Couldn't grant indexer access",
            body:
              err instanceof Error
                ? `${err.message} Indexing still works; manifests will be worker-owned until you retry.`
                : "Indexing still works; manifests will be worker-owned until you retry.",
          });
        } finally {
          setGranting(false);
        }
      }
    } catch (err) {
      show({
        tone: "error",
        title: "Couldn't enable Knowledge",
        body:
          err instanceof ControlPlaneError ? err.message
          : err instanceof Error ? err.message
          : "Try again.",
      });
    }
  };

  const onDisable = async () => {
    setConfirmDisable(false);
    try {
      const res = await toggle.mutateAsync(false);
      show({
        tone: "success",
        title: "Knowledge disabled",
        body:
          res.chunks_deleted
            ? `Removed ${res.chunks_deleted.toLocaleString()} chunk${res.chunks_deleted === 1 ? "" : "s"}.`
            : "No chunks to remove.",
      });
    } catch (err) {
      show({
        tone: "error",
        title: "Couldn't disable Knowledge",
        body:
          err instanceof ControlPlaneError ? err.message
          : err instanceof Error ? err.message
          : "Try again.",
      });
    }
  };

  if (!status.enabled) {
    return (
      <div className="ks-card">
        <div className="ks-card-head">
          <div className="ks-card-title">Knowledge is off</div>
          <div className="ks-card-sub">
            Turn on Knowledge to index this bucket. Every object gets
            chunked, embedded, and made searchable through the dashboard,
            the API, and the MCP server. Plaintext stays on Walrus —
            only chunk vectors land in our database.
          </div>
        </div>
        <div className="ks-card-body">
          <Button
            variant="cta"
            icon="plus"
            onClick={onEnable}
            loading={toggle.isPending || granting}
          >
            {granting ? "Granting indexer access…" : "Enable Knowledge"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="ks-card">
        <div className="ks-card-head">
          <div className="ks-card-title">Knowledge is on</div>
          <div className="ks-card-sub">
            New uploads are indexed automatically. Settings use the
            defaults the plan calls out — text-embedding-3-small at 1024
            dimensions, 400-token chunks, 60-token overlap.
          </div>
        </div>
        <div className="ks-card-body">
          <Button
            variant="secondary"
            icon="shieldOff"
            onClick={() => setConfirmDisable(true)}
            loading={toggle.isPending}
          >
            Disable Knowledge
          </Button>
        </div>
      </div>

      <ConfirmModal
        open={confirmDisable}
        title="Disable Knowledge on this bucket?"
        body={
          <Banner
            tone="warning"
            title="This removes every chunk for this bucket."
            body="Search and ask requests against this bucket will return empty results until you re-enable. Re-enabling kicks off a full backfill."
          />
        }
        confirmLabel="Disable Knowledge"
        danger
        busy={toggle.isPending}
        onConfirm={onDisable}
        onCancel={() => setConfirmDisable(false)}
      />
    </>
  );
}
