"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EMBEDDING_OPTIONS } from "@kraterion/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { env } from "@/lib/env";
import { suiscanTxUrl } from "@/lib/format";
import {
  useKnowledgeBackfill,
  useMe,
  useProviderCredentials,
  useReindexKnowledge,
  useToggleKnowledge,
  type KnowledgeStatus,
  type ReindexKnowledgePayload,
  type ToggleKnowledgePayload,
} from "@/lib/queries";
import { useSponsoredTx } from "@/lib/sponsor";
import { EnableKnowledgeModal } from "./EnableKnowledgeModal";

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
  const backfill = useKnowledgeBackfill(bucketId);
  const reindex = useReindexKnowledge(bucketId);
  const runSponsored = useSponsoredTx();
  const router = useRouter();
  const { show } = useToast();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [reindexOpen, setReindexOpen] = useState(false);
  const [granting, setGranting] = useState(false);
  const [credentialMissing, setCredentialMissing] = useState(false);

  // Surface the project's OpenAI credential state inline so the
  // empty-state can swap the Enable CTA for an "Add OpenAI key"
  // redirect (instead of letting the user click and bounce off a 409).
  const { data: me } = useMe();
  const projectId = me?.projects[0]?.id;
  const { data: creds } = useProviderCredentials(projectId);
  const hasActiveOpenAi = (creds?.credentials ?? []).some(
    (c) => c.provider === "openai" && c.status === "active",
  );

  const onEnable = async (payload: ToggleKnowledgePayload) => {
    setCredentialMissing(false);
    try {
      const res = await toggle.mutateAsync(payload);
      setEnableOpen(false);
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

          // Race fix (Issue #5): the enable response deferred the
          // backfill while waiting for the grant tx. Now that it's
          // landed, kick the worker queue. If we'd let backfill fire at
          // enable time, the first batch of archive attempts would
          // burn through their retries trying to write manifests
          // against an unauthorized bucket.
          if (res.backfill_deferred) {
            try {
              const queued = await backfill.mutateAsync();
              if (queued.queued_objects > 0) {
                show({
                  tone: "info",
                  title: "Indexing started",
                  body: `Queued ${queued.queued_objects} object${queued.queued_objects === 1 ? "" : "s"} for indexing.`,
                });
              }
            } catch (err) {
              show({
                tone: "warning",
                title: "Couldn't start indexing",
                body:
                  err instanceof Error
                    ? `${err.message} Re-toggle Knowledge to retry.`
                    : "Re-toggle Knowledge to retry.",
              });
            }
          }
        } catch (err) {
          show({
            tone: "warning",
            title: "Couldn't grant indexer access",
            body:
              err instanceof Error
                ? `${err.message} New uploads index normally; manifests will be worker-owned until you retry.`
                : "New uploads index normally; manifests will be worker-owned until you retry.",
          });
        } finally {
          setGranting(false);
        }
      }
    } catch (err) {
      if (
        err instanceof ControlPlaneError &&
        err.code === "PreconditionFailed" &&
        err.details?.["provider"] === "openai"
      ) {
        setCredentialMissing(true);
        return;
      }
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

      // K5: if the indexer is still on the bucket's on-chain grant list,
      // fire a sponsored revoke so its authority matches the disable
      // intent. The Move package doesn't expose a per-address revoke,
      // so the CP builds a `revoke_all + grant(gateway)` PTB that
      // atomically removes only the indexer.
      if (res.needs_indexer_revoke) {
        setGranting(true);
        try {
          const revoke = await runSponsored({
            prepareEndpoint: `/v1/buckets/${bucketId}/prepare-revoke-indexer`,
          });
          show({
            tone: "success",
            title: "Indexer access revoked",
            body: (
              <>
                The Knowledge indexer no longer has authority on this
                bucket.{" "}
                <a
                  href={suiscanTxUrl(revoke.digest, env.network)}
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
            title: "Couldn't revoke indexer access on chain",
            body:
              err instanceof Error
                ? `${err.message} Indexing is already disabled in our system; the on-chain ACL still grants the indexer until you retry.`
                : "Indexing is already disabled; retry to clean up the on-chain ACL.",
          });
        } finally {
          setGranting(false);
        }
      }
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

  // The shared modal hands back a `ToggleKnowledgePayload` whose `enabled`
  // is always `true`. Strip that field and forward only the settings to
  // the re-index endpoint.
  const onReindex = async (payload: ToggleKnowledgePayload) => {
    const reindexPayload: ReindexKnowledgePayload = {
      ...(payload.embedding_model !== undefined
        ? { embedding_model: payload.embedding_model }
        : {}),
      ...(payload.embedding_dimensions !== undefined
        ? { embedding_dimensions: payload.embedding_dimensions }
        : {}),
      ...(payload.chunk_tokens !== undefined
        ? { chunk_tokens: payload.chunk_tokens }
        : {}),
      ...(payload.chunk_overlap_tokens !== undefined
        ? { chunk_overlap_tokens: payload.chunk_overlap_tokens }
        : {}),
    };
    try {
      const res = await reindex.mutateAsync(reindexPayload);
      setReindexOpen(false);
      show({
        tone: "success",
        title: "Re-index started",
        body: `Dropped ${res.chunks_deleted.toLocaleString()} chunk${res.chunks_deleted === 1 ? "" : "s"} and queued ${res.queued_objects.toLocaleString()} object${res.queued_objects === 1 ? "" : "s"}. Search returns empty for this bucket until the worker drains.`,
      });
    } catch (err) {
      show({
        tone: "error",
        title: "Couldn't re-index",
        body:
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Try again.",
      });
    }
  };

  // Lightweight settings write: only the chat model changes. Goes
  if (!status.enabled) {
    // No project-scoped OpenAI key → don't even offer the Enable CTA.
    // The toggle would 409 the moment it's pressed; redirect the user
    // straight to where they can fix it, and keep an info banner up
    // so the reason is visible without an extra click.
    if (creds && !hasActiveOpenAi) {
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
          <div
            className="ks-card-body"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <Banner
              tone="info"
              icon="info"
              title="An OpenAI key is required to enable Knowledge"
              body={
                <>
                  Knowledge uses your project&apos;s OpenAI key for
                  embedding objects and answering questions. Add one to
                  unlock indexing and search across every bucket in this
                  project.{" "}
                  <Link href="/keys?tab=providers">Manage providers</Link>.
                </>
              }
            />
            <div>
              <Button
                variant="cta"
                icon="key"
                onClick={() => router.push("/keys?tab=providers")}
              >
                Add OpenAI key
              </Button>
            </div>
          </div>
        </div>
      );
    }

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
        <div className="ks-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {credentialMissing ? (
            <Banner
              tone="warning"
              title="Configure an OpenAI key first"
              body={
                <>
                  Knowledge uses your project&apos;s OpenAI key for
                  embedding and answering questions.{" "}
                  <Link href="/keys?tab=providers">Manage providers</Link>.
                </>
              }
            />
          ) : null}
          <div>
            <Button
              variant="cta"
              icon="plus"
              onClick={() => setEnableOpen(true)}
              loading={toggle.isPending || granting}
            >
              {granting ? "Granting indexer access…" : "Enable Knowledge"}
            </Button>
          </div>
        </div>

        <EnableKnowledgeModal
          open={enableOpen}
          status={status}
          busy={toggle.isPending}
          onCancel={() => (toggle.isPending ? undefined : setEnableOpen(false))}
          onConfirm={onEnable}
        />
      </div>
    );
  }

  // Resolve display labels via the shared catalog so "1024" reads as
  // its full model+dim string and unknown values still render literally.
  const embeddingLabel = (() => {
    if (!status.settings) return null;
    const m = status.settings.embedding_model;
    const d = status.settings.embedding_dimensions;
    const option = EMBEDDING_OPTIONS.find(
      (o) => o.model === m && o.dimensions === d,
    );
    return option?.label ?? `${m} @ ${d}d`;
  })();
  const mutating = toggle.isPending || reindex.isPending;

  return (
    <>
      <div className="ks-card">
        <div className="ks-card-head">
          <div className="ks-card-title">Knowledge is on</div>
          <div className="ks-card-sub">
            New uploads are indexed automatically. Search and ask are
            powered by the models below.
          </div>
        </div>

        <div className="ks-card-body" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <ModelRow
            icon="chart"
            label="Embedding model"
            value={embeddingLabel ?? "—"}
            helper="Used to index every object in this bucket. Changing it requires re-indexing — chunks are dropped and rebuilt."
            actionLabel="Change embedding model"
            destructive
            onAction={() => setReindexOpen(true)}
            disabled={mutating}
            last
          />
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "16px 0 0",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <Icon
            name="settings"
            size={16}
            style={{ color: "var(--text-secondary)", marginTop: 2 }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="micro"
              style={{ color: "var(--text-tertiary)", marginBottom: 4 }}
            >
              Chat
            </div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              Use an agent to ask questions
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              The bucket no longer carries a per-bucket chat model.
              Create or pick an agent to chat against this bucket — agents
              own the system prompt, model, sampling controls, and audit
              trail.
            </div>
          </div>
          <Link
            href="/agents"
            style={{ textDecoration: "none" }}
          >
            <Button variant="secondary" size="sm" icon="settings">
              Manage agents
            </Button>
          </Link>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Button
            variant="ghost"
            icon="shieldOff"
            onClick={() => setConfirmDisable(true)}
            loading={toggle.isPending}
            disabled={reindex.isPending}
            style={{ color: "var(--error)" }}
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

      <EnableKnowledgeModal
        open={reindexOpen}
        mode="reindex"
        status={status}
        busy={reindex.isPending}
        onCancel={() => (reindex.isPending ? undefined : setReindexOpen(false))}
        onConfirm={onReindex}
      />

    </>
  );
}

interface ModelRowProps {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  valueMono?: boolean;
  helper: React.ReactNode;
  actionLabel: string;
  /** When true, the helper is styled as a warning to flag that the
   *  action is destructive (re-index drops chunks). */
  destructive?: boolean;
  onAction: () => void;
  disabled?: boolean;
  /** Skip the hairline divider — use on the final row in a stack so
   *  the card doesn't end with a separator above unrelated content. */
  last?: boolean;
}

function ModelRow({
  icon,
  label,
  value,
  valueMono = true,
  helper,
  actionLabel,
  destructive = false,
  onAction,
  disabled,
  last = false,
}: ModelRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "20px minmax(0, 1fr) auto",
        columnGap: 12,
        alignItems: "start",
        padding: "16px 0",
        ...(last ? {} : { borderBottom: "1px solid var(--border)" }),
      }}
    >
      <Icon
        name={icon}
        size={16}
        style={{ color: "var(--text-secondary)", marginTop: 2 }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          className="micro"
          style={{ color: "var(--text-tertiary)", marginBottom: 4 }}
        >
          {label}
        </div>
        <div
          className={valueMono ? "mono" : undefined}
          style={{
            fontSize: 14,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 12,
            color: destructive ? "var(--warning)" : "var(--text-tertiary)",
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          {destructive ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="alert" size={14} />
              {helper}
            </span>
          ) : (
            helper
          )}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onAction}
        disabled={disabled}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
