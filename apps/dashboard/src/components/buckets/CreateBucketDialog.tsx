"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { env } from "@/lib/env";
import { suiscanTxUrl } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { statusLabel, useSponsoredTx, type SponsorStatus } from "@/lib/sponsor";

const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * "New bucket" dialog. Mirrors the CP DTO at
 * `apps/control-plane/src/buckets/prepare/dto.ts` — name regex,
 * encryption_mode enum, grant_api_access flag.
 */
export function CreateBucketDialog({ open, onClose }: Props) {
  const { data: me } = useMe();
  const projectId = me?.projects[0]?.id;
  const router = useRouter();
  const { show } = useToast();
  const runSponsored = useSponsoredTx();

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"private" | "public-read">("private");
  const [grantApi, setGrantApi] = useState(true);
  const [status, setStatus] = useState<SponsorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null && status !== "done";

  if (!open) return null;

  const validate = (): string | null => {
    if (!BUCKET_NAME.test(name)) {
      return "Use 3–63 chars: lowercase letters, digits, hyphens, dots. Must start and end with a letter or digit.";
    }
    if (!projectId) return "Project isn't ready yet. Try again in a moment.";
    return null;
  };

  const onSubmit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    try {
      const result = await runSponsored({
        prepareEndpoint: "/v1/buckets/prepare-create",
        body: {
          project_id: projectId,
          name,
          encryption_mode: mode,
          grant_api_access: grantApi,
        },
        onStatus: setStatus,
      });
      show({
        tone: "success",
        title: `Bucket "${name}" created`,
        body: (
          <>
            Appears in your list shortly.{" "}
            <a href={suiscanTxUrl(result.digest, env.network)} target="_blank" rel="noreferrer">
              View on-chain ↗
            </a>
          </>
        ),
        sticky: true,
      });
      onClose();
      setName("");
      setStatus(null);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create the bucket. Try again.";
      setError(message);
      setStatus(null);
    }
  };

  return (
    <Portal>
    <div className="ks-modal-scrim" onClick={busy ? undefined : onClose}>
      <div className="ks-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ks-modal-head">
          <div style={{ fontSize: 18, fontWeight: 500 }}>New bucket</div>
          <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FormField
            label="Name"
            helper="Lowercase, 3–63 chars. Letters, digits, hyphens, dots."
            required
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-bucket"
              disabled={busy}
            />
          </FormField>

          <FormField label="Visibility" required>
            <div style={{ display: "flex", gap: 8 }}>
              <ModeRadio
                label="Private"
                description="Encrypted — only you and clients you authorize can read files."
                checked={mode === "private"}
                onChange={() => setMode("private")}
                disabled={busy}
              />
              <ModeRadio
                label="Public"
                description="Anyone with the link can read the file."
                checked={mode === "public-read"}
                onChange={() => setMode("public-read")}
                disabled={busy}
              />
            </div>
          </FormField>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "8px 0" }}>
            <input
              type="checkbox"
              checked={grantApi}
              onChange={(e) => setGrantApi(e.target.checked)}
              disabled={busy}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Grant API access</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                Lets boto3, aws-cli, and rclone upload and download. You can revoke it later.
              </div>
            </div>
          </label>

          {error ? <div className="ks-field-error">{error}</div> : null}
          {status && status !== "done" ? (
            <div className="ks-field-helper" style={{ color: "var(--text-secondary)" }}>
              {statusLabel(status)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="cta" onClick={onSubmit} loading={busy}>
            {busy ? statusLabel(status!) : "Create bucket"}
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

function ModeRadio(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 12px",
        border: `1px solid ${props.checked ? "var(--krater)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        background: props.checked ? "rgba(196, 91, 54, 0.04)" : "var(--bg-elevated)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="radio"
          checked={props.checked}
          onChange={props.onChange}
          disabled={props.disabled}
        />
        <span style={{ fontSize: 14, fontWeight: 500 }}>{props.label}</span>
      </span>
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{props.description}</span>
    </label>
  );
}
