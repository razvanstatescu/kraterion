"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { useMintApiKey, type MintedApiKey } from "@/lib/queries";
import { QuickstartCode } from "./QuickstartCode";

const KEY_NAME = /^[A-Za-z0-9 _.\-]{1,64}$/;

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string | undefined;
}

/**
 * Two-stage dialog:
 *   1. Name input → submit → CP mints key.
 *   2. "Save it now" panel: AKIA + secret in mono + Copy buttons +
 *      tabbed quickstart snippets. Closing wipes the secret.
 *
 * The cleartext secret only ever lives in this dialog's local state.
 * On close (X, Done button, or Escape) we set it back to null so the
 * value is no longer reachable from React state. No persistence.
 */
export function CreateApiKeyDialog({ open, onClose, projectId }: Props) {
  const { show } = useToast();
  const mint = useMintApiKey(projectId);

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedApiKey | null>(null);
  const [copied, setCopied] = useState<"akia" | "secret" | null>(null);

  const busy = mint.isPending;

  // Reset state every time the dialog opens — the secret is sensitive
  // and we don't want a stale one floating in state if the user reopens.
  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      setMinted(null);
      setCopied(null);
    }
  }, [open]);

  if (!open) return null;

  const onSubmit = async () => {
    if (!KEY_NAME.test(name)) {
      setError("Use 1–64 chars: letters, digits, spaces, dots, hyphens, underscores.");
      return;
    }
    if (!projectId) {
      setError("Project isn't ready yet. Try again in a moment.");
      return;
    }
    setError(null);
    try {
      const res = await mint.mutateAsync(name);
      setMinted(res);
      show({ tone: "success", title: `Key "${res.api_key.name}" created` });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create the key. Try again.";
      setError(message);
    }
  };

  const onCopy = async (which: "akia" | "secret", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard API rejects in non-secure contexts; ignore quietly.
    }
  };

  return (
    <Portal>
    <div className="ks-modal-scrim" onClick={busy ? undefined : onClose}>
      <div
        className="ks-modal"
        style={{ width: 640, maxWidth: "calc(100vw - 32px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ks-modal-head">
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {minted ? "Save your secret" : "New access key"}
          </div>
          <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
        </div>

        {minted ? (
          // === Show-once panel ===========================================
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Banner
              tone="warning"
              icon="alert"
              title="This is the only time the secret is shown"
              body="Copy it now into a password manager or env file. There's no way to retrieve it later — revoke and mint a new one if you lose it."
            />

            <FormField label="Access key id (AKIA)">
              <div className="ks-codeline mono" style={{ cursor: "default" }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {minted.api_key.access_key_id ?? "—"}
                </span>
                <button
                  className="icon-btn"
                  onClick={() => void onCopy("akia", minted.api_key.access_key_id ?? "")}
                  title="Copy AKIA"
                  type="button"
                >
                  <Icon name="copy" size={14} />
                </button>
              </div>
              {copied === "akia" ? <div className="ks-field-helper" style={{ color: "var(--success)" }}>Copied</div> : null}
            </FormField>

            <FormField label="Secret access key">
              <div className="ks-codeline mono" style={{ cursor: "default", background: "var(--stone-100)" }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {minted.secret}
                </span>
                <button
                  className="icon-btn"
                  onClick={() => void onCopy("secret", minted.secret)}
                  title="Copy secret"
                  type="button"
                >
                  <Icon name="copy" size={14} />
                </button>
              </div>
              {copied === "secret" ? <div className="ks-field-helper" style={{ color: "var(--success)" }}>Copied</div> : null}
            </FormField>

            <div>
              <div className="micro" style={{ marginBottom: 8 }}>Quickstart</div>
              <QuickstartCode
                accessKeyId={minted.api_key.access_key_id ?? ""}
                secret={minted.secret}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="cta" onClick={onClose}>I&apos;ve saved the secret</Button>
            </div>
          </div>
        ) : (
          // === Name input stage ==========================================
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormField
              label="Name"
              helper="A short label so future-you remembers what this key is for."
              required
            >
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production app server"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) void onSubmit();
                }}
              />
            </FormField>
            {error ? <div className="ks-field-error">{error}</div> : null}
            <p className="lead" style={{ fontSize: 13 }}>
              Use this with any S3-compatible client. We never see the secret after
              you create it.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="cta" onClick={onSubmit} loading={busy}>
                {busy ? "Creating…" : "Create key"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}
