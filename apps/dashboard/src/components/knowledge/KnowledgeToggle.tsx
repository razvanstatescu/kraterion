"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { useToggleKnowledge, type KnowledgeStatus } from "@/lib/queries";

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
  const { show } = useToast();
  const [confirmDisable, setConfirmDisable] = useState(false);

  const onEnable = async () => {
    try {
      const res = await toggle.mutateAsync(true);
      show({
        tone: "success",
        title: "Knowledge enabled",
        body:
          res.backfilled_objects && res.backfilled_objects > 0
            ? `Queued ${res.backfilled_objects} object${res.backfilled_objects === 1 ? "" : "s"} for indexing.`
            : "New uploads will be indexed automatically.",
      });
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
            loading={toggle.isPending}
          >
            Enable Knowledge
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
