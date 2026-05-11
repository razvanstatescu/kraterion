"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Drawer } from "@/components/ui/Drawer";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type BucketJson } from "@/lib/api";
import { env } from "@/lib/env";
import { suiscanTxUrl } from "@/lib/format";
import { statusLabel, useSponsoredTx, type SponsorStatus } from "@/lib/sponsor";

interface Props {
  open: boolean;
  onClose: () => void;
  bucket: BucketJson;
}

type Action =
  | { kind: "visibility"; nextMode: "private" | "public-read" }
  | { kind: "revoke" }
  | { kind: "grant" };

/**
 * Bucket settings drawer. Three sponsored-tx actions live here —
 * change visibility, revoke API access, grant API access — each
 * funneling through `useSponsoredTx`.
 *
 * Each action opens a `ConfirmModal` with explicit copy before
 * the sponsorship runs. The revoke flow uses the "twist 2" wording
 * from `/docs/implementation-plan.md` §9.3 so the demo viewer
 * understands what's actually happening on-chain.
 */
export function BucketSettingsDrawer({ open, onClose, bucket }: Props) {
  const { show } = useToast();
  const runSponsored = useSponsoredTx();
  const [pending, setPending] = useState<Action | null>(null);
  const [status, setStatus] = useState<SponsorStatus | null>(null);
  const [pendingMode, setPendingMode] = useState<"private" | "public-read">(bucket.encryption_mode);
  const busy = status !== null && status !== "done";

  const runAction = async (action: Action) => {
    setStatus(null);
    const endpoint =
      action.kind === "visibility"
        ? `/v1/buckets/${bucket.id}/prepare-visibility`
        : action.kind === "revoke"
          ? `/v1/buckets/${bucket.id}/prepare-revoke-all`
          : `/v1/buckets/${bucket.id}/prepare-grant-api`;
    const body =
      action.kind === "visibility"
        ? { encryption_mode: action.nextMode }
        : {};
    try {
      const result = await runSponsored({
        prepareEndpoint: endpoint,
        body,
        onStatus: setStatus,
      });
      const successCopy =
        action.kind === "visibility"
          ? `Visibility set to ${action.nextMode}.`
          : action.kind === "revoke"
            ? "API access revoked. SDK requests will fail until you re-grant."
            : "API access granted. boto3 / aws-cli / rclone can now read this bucket again.";
      show({
        tone: "success",
        title: `Bucket "${bucket.name}" updated`,
        body: (
          <>
            {successCopy}{" "}
            <a href={suiscanTxUrl(result.digest, env.network)} target="_blank" rel="noreferrer">
              View on-chain ↗
            </a>
          </>
        ),
        sticky: true,
      });
      setPending(null);
      setStatus(null);
      // Close drawer on revoke / grant — the page banner will pick up
      // the new state. Visibility flip leaves the drawer open so the
      // user can immediately flip again if they were experimenting.
      if (action.kind !== "visibility") onClose();
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't update the bucket. Try again.";
      show({ tone: "error", title: "Update failed", body: message });
      setPending(null);
      setStatus(null);
    }
  };

  return (
    <>
      <Drawer
        open={open && pending === null}
        onClose={onClose}
        title="Bucket settings"
        eyebrow={bucket.name}
        width={460}
      >
        {/* Visibility section */}
        <section style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Visibility</h4>
          <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>
            Controls who Seal will release decryption shares to. Affects every
            file in the bucket immediately.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <ModePill
              label="Private"
              checked={pendingMode === "private"}
              onClick={() => setPendingMode("private")}
            />
            <ModePill
              label="Public"
              checked={pendingMode === "public-read"}
              onClick={() => setPendingMode("public-read")}
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={pendingMode === bucket.encryption_mode}
            onClick={() => setPending({ kind: "visibility", nextMode: pendingMode })}
          >
            Save visibility
          </Button>
        </section>

        <hr className="divider" style={{ height: 1, background: "var(--border)", border: 0, margin: "0 0 24px 0" }} />

        {/* API access section */}
        <section style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>API access</h4>
          <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>
            When granted, the gateway can read and write into this bucket via
            SigV4 (boto3, aws-cli, rclone). When revoked, on-chain Seal denies
            even our own gateway — only you can read the files in the dashboard.
          </p>
          <div style={{ marginBottom: 12 }}>
            <Pill tone={bucket.api_access_granted ? "success" : "error"} dot>
              {bucket.api_access_granted ? "Granted" : "Revoked"}
            </Pill>
          </div>
          {bucket.api_access_granted ? (
            <Button
              variant="danger"
              size="sm"
              icon="shieldOff"
              onClick={() => setPending({ kind: "revoke" })}
            >
              Revoke API access
            </Button>
          ) : (
            <Button
              variant="cta"
              size="sm"
              icon="unlock"
              onClick={() => setPending({ kind: "grant" })}
            >
              Restore API access
            </Button>
          )}
        </section>

        <hr className="divider" style={{ height: 1, background: "var(--border)", border: 0, margin: "0 0 24px 0" }} />

        {/* Danger zone — delete stubbed for Phase E */}
        <section>
          <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Danger zone</h4>
          <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>
            Deleting a bucket marks it removed from the dashboard. The on-chain
            object and any files persist — that&apos;s the whole point.
          </p>
          <Banner
            tone="warning"
            title="Bucket deletion lights up in Phase E"
            body="Right now the gateway's DELETE /:bucket path is the way to remove a bucket; the dashboard's wrapper is next."
          />
        </section>

        {status && status !== "done" ? (
          <div className="ks-field-helper" style={{ marginTop: 16, color: "var(--text-secondary)" }}>
            {statusLabel(status)}
          </div>
        ) : null}
      </Drawer>

      {/* Confirm modals — one per action kind */}
      {pending?.kind === "visibility" ? (
        <ConfirmModal
          open
          onCancel={() => (busy ? undefined : setPending(null))}
          onConfirm={() => runAction(pending)}
          busy={busy}
          danger={false}
          confirmLabel={busy ? statusLabel(status!) : "Change visibility"}
          title={`Change visibility to ${pending.nextMode}?`}
          body={
            <>
              <p>
                You&apos;re changing &ldquo;{bucket.name}&rdquo; from{" "}
                <strong>{bucket.encryption_mode}</strong> to{" "}
                <strong>{pending.nextMode}</strong>.
              </p>
              <p style={{ marginTop: 8 }}>
                Affects every existing file immediately — Seal&apos;s
                policy is bucket-scoped, not per-file. No re-upload needed.
              </p>
            </>
          }
          onchainNote="Settles via an Enoki-sponsored Sui transaction. Zero gas for you."
        />
      ) : null}

      {pending?.kind === "revoke" ? (
        <ConfirmModal
          open
          onCancel={() => (busy ? undefined : setPending(null))}
          onConfirm={() => runAction(pending)}
          busy={busy}
          danger
          confirmLabel={busy ? statusLabel(status!) : "Revoke API access"}
          title="Revoke API access?"
          body={
            <>
              <p>
                After this, the gateway can no longer read or write to{" "}
                &ldquo;{bucket.name}&rdquo; via SigV4. boto3, aws-cli,
                rclone &mdash; they all start failing with{" "}
                <code>KeyAccessRevoked</code>.
              </p>
              <p style={{ marginTop: 8 }}>
                Files remain encrypted on-chain. You can still preview and
                download them from this dashboard. Restore access any time.
              </p>
            </>
          }
          onchainNote="Enforced on-chain by Seal's threshold key servers. Even Kraterion can't bypass it."
        />
      ) : null}

      {pending?.kind === "grant" ? (
        <ConfirmModal
          open
          onCancel={() => (busy ? undefined : setPending(null))}
          onConfirm={() => runAction(pending)}
          busy={busy}
          danger={false}
          confirmLabel={busy ? statusLabel(status!) : "Restore API access"}
          title="Restore API access?"
          body={
            <>
              <p>
                The gateway will be re-added to &ldquo;{bucket.name}&rdquo;&apos;s
                authorized address list. SDK requests resume.
              </p>
              <p style={{ marginTop: 8 }}>
                Seal key servers update their cache within a few seconds.
              </p>
            </>
          }
          onchainNote="Settles via an Enoki-sponsored Sui transaction."
        />
      ) : null}
    </>
  );
}

function ModePill({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        background: checked ? "rgba(196, 91, 54, 0.06)" : "var(--bg-elevated)",
        border: `1px solid ${checked ? "var(--krater)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        fontWeight: checked ? 500 : 400,
        cursor: "pointer",
        color: checked ? "var(--text-primary)" : "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );
}
