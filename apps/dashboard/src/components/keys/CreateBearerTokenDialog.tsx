"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type MintBearerResponse } from "@/lib/api";
import { env } from "@/lib/env";
import { useMintBearerToken } from "@/lib/queries";
import { BearerQuickstartCode } from "./BearerQuickstartCode";

const KEY_NAME = /^[A-Za-z0-9 _.\-]{1,64}$/;

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string | undefined;
}

/**
 * Mint a unified bearer API token (`kr_live_…` / `kr_test_…`).
 *
 * The cleartext token is shown exactly once on the success panel; closing
 * the dialog drops it from state. We deliberately do not persist the
 * token anywhere — re-minting is the only recovery if the user loses it.
 */
export function CreateBearerTokenDialog({ open, onClose, projectId }: Props) {
  const { show } = useToast();
  const mint = useMintBearerToken(projectId);

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintBearerResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const busy = mint.isPending;
  const isTestnet = env.network !== "mainnet";

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      setMinted(null);
      setCopied(false);
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
      show({ tone: "success", title: `Token "${res.api_key.name}" created` });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create the token. Try again.";
      setError(message);
    }
  };

  const onCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
              {minted ? "Save your token" : "New API token"}
            </div>
            <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
          </div>

          {minted ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Banner
                tone="warning"
                icon="alert"
                title="This is the only time the token is shown"
                body="Copy it now into a password manager or env file. There's no way to retrieve it later — revoke and mint a new one if you lose it."
              />

              <FormField label="API token">
                <div
                  className="ks-codeline mono"
                  style={{ cursor: "default", background: "var(--stone-100)" }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {minted.token}
                  </span>
                  <button
                    className="icon-btn"
                    onClick={() => void onCopy(minted.token)}
                    title="Copy token"
                    type="button"
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </div>
                {copied ? (
                  <div className="ks-field-helper" style={{ color: "var(--success)" }}>
                    Copied
                  </div>
                ) : null}
              </FormField>

              <div>
                <div className="micro" style={{ marginBottom: 8 }}>Quickstart</div>
                <BearerQuickstartCode token={minted.token} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="cta" onClick={onClose}>
                  I&apos;ve saved the token
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Pill tone={isTestnet ? "info" : "success"} dot>
                  {isTestnet ? "Testnet" : "Mainnet"}
                </Pill>
                <span className="muted" style={{ fontSize: 13 }}>
                  You&apos;ll get a{" "}
                  <code className="mono">{isTestnet ? "kr_test_…" : "kr_live_…"}</code>{" "}
                  token scoped to this environment.
                </span>
              </div>

              <FormField
                label="Name"
                helper="A short label so future-you remembers what this token is for."
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
                One token works across the whole API. Use it anywhere you&apos;d
                paste an API key.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="cta" onClick={onSubmit} loading={busy}>
                  {busy ? "Creating…" : "Create token"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
