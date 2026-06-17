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
            ? "API access revoked. S3 clients will fail until you restore it."
            : "API access restored. boto3, aws-cli, and rclone can reach this bucket again.";
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
            Controls who can decrypt your files. Applies to every file in the
            bucket right away.
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
            When granted, S3 clients like boto3, aws-cli, and rclone can read and
            write to this bucket. When revoked, even Kraterion&apos;s gateway is
            locked out on-chain — only you can read these files, here in the dashboard.
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

        {/* Danger zone — dashboard delete not yet wired up */}
        <section>
          <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Danger zone</h4>
          <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>
            Deleting a bucket removes it from the dashboard. The on-chain object
            and your files stay put.
          </p>
          <Banner
            tone="warning"
            title="Deleting from the dashboard isn't available yet"
            body="For now, remove a bucket through the API."
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
                Applies to every existing file right away. No re-upload needed.
              </p>
            </>
          }
          onchainNote="No gas and no wallet popup — we sponsor the transaction."
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
                S3 clients can no longer read or write to{" "}
                &ldquo;{bucket.name}&rdquo;. boto3, aws-cli, and rclone start
                failing with <code>KeyAccessRevoked</code>.
              </p>
              <p style={{ marginTop: 8 }}>
                Files stay encrypted on-chain. You can still preview and
                download them here. Restore access any time.
              </p>
            </>
          }
          onchainNote="Enforced on-chain by Seal's key servers. Even Kraterion can't bypass it."
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
                S3 clients can read and write to &ldquo;{bucket.name}&rdquo;
                again. Access resumes within a few seconds.
              </p>
            </>
          }
          onchainNote="No gas and no wallet popup — we sponsor the transaction."
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
