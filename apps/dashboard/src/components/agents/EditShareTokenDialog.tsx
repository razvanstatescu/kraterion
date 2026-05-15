"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type ShareTokenJson } from "@/lib/api";
import { useUpdateShareToken, type UpdateShareTokenInput } from "@/lib/queries";

interface Props {
  open: boolean;
  agentId: string;
  token: ShareTokenJson | null;
  onClose: () => void;
}

const NAME_RE = /^[A-Za-z0-9 _.\-]{1,64}$/;
const ORIGIN_RE = /^https?:\/\/[^/\s]+$/;

/**
 * P6 — Edit an existing share token. Mirrors the create dialog's
 * form but skips the reveal panel — the cleartext token is immutable
 * (changing origins / caps / cite_sources is all in scope, but
 * rotating the credential means minting a new one).
 *
 * Sends only the fields the user changed (diff against the original
 * row) so the audit story stays clean — "the user touched these
 * three fields," not "everything is now this."
 */
export function EditShareTokenDialog({ open, agentId, token, onClose }: Props) {
  const { show } = useToast();
  const update = useUpdateShareToken(agentId);

  const [name, setName] = useState("");
  const [originsRaw, setOriginsRaw] = useState("");
  const [maxRequests, setMaxRequests] = useState("");
  const [maxSpendUsd, setMaxSpendUsd] = useState("");
  const [citeSources, setCiteSources] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const busy = update.isPending;

  // When the dialog opens (or the token target changes), seed every
  // field from the row so the form reflects the persisted state.
  useEffect(() => {
    if (!open || !token) return;
    setName(token.name);
    setOriginsRaw(token.allowed_origins.join("\n"));
    setMaxRequests(
      token.max_requests_per_day === null ? "" : String(token.max_requests_per_day),
    );
    setMaxSpendUsd(
      token.max_spend_usd_per_day === null
        ? ""
        : String(token.max_spend_usd_per_day),
    );
    setCiteSources(token.cite_sources);
    setError(null);
  }, [open, token]);

  if (!open || !token) return null;

  const onSubmit = async () => {
    if (!NAME_RE.test(name)) {
      setError("Use 1–64 chars: letters, digits, spaces, dots, hyphens, underscores.");
      return;
    }
    const origins = originsRaw
      .split(/\s+/)
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
    if (origins.length === 0) {
      setError("Add at least one origin.");
      return;
    }
    for (const o of origins) {
      if (!ORIGIN_RE.test(o)) {
        setError(`"${o}" isn't a valid origin. Use https://host (no trailing path).`);
        return;
      }
    }
    const reqCap = maxRequests.trim() === "" ? null : Number(maxRequests);
    if (reqCap !== null && (!Number.isInteger(reqCap) || reqCap < 1)) {
      setError("Daily request cap must be a positive whole number, or blank for unlimited.");
      return;
    }
    const spendCap = maxSpendUsd.trim() === "" ? null : Number(maxSpendUsd);
    if (spendCap !== null && (!Number.isFinite(spendCap) || spendCap < 0)) {
      setError("Daily spend cap must be a positive number, or blank for unlimited.");
      return;
    }

    // Diff against the server-truth and only send fields that actually
    // changed. Keeps the audit story precise.
    const diff: UpdateShareTokenInput = {};
    if (name.trim() !== token.name) diff.name = name.trim();
    if (originsRaw.split(/\s+/).filter(Boolean).join(",") !==
      token.allowed_origins.join(",")) {
      diff.allowed_origins = origins;
    }
    if (reqCap !== token.max_requests_per_day) diff.max_requests_per_day = reqCap;
    if (spendCap !== token.max_spend_usd_per_day) diff.max_spend_usd_per_day = spendCap;
    if (citeSources !== token.cite_sources) diff.cite_sources = citeSources;

    if (Object.keys(diff).length === 0) {
      onClose();
      return;
    }

    setError(null);
    try {
      await update.mutateAsync({ tokenId: token.id, input: diff });
      show({ tone: "success", title: `"${name.trim()}" updated` });
      onClose();
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't save changes. Try again.";
      setError(message);
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
            <div style={{ fontSize: 18, fontWeight: 500 }}>Edit share link</div>
            <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormField
              label="Name"
              helper="A short label so you remember where this snippet is installed."
              required
            >
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </FormField>

            <FormField
              label="Allowed origins"
              helper="One per line. Match exactly — protocol + host."
              required
            >
              <textarea
                className="input"
                value={originsRaw}
                onChange={(e) => setOriginsRaw(e.target.value)}
                rows={3}
                disabled={busy}
                placeholder={"https://www.example.com\nhttps://docs.example.com"}
                style={{ resize: "vertical", lineHeight: 1.55 }}
              />
            </FormField>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <FormField label="Daily request cap" helper="Blank for unlimited.">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={maxRequests}
                  onChange={(e) => setMaxRequests(e.target.value)}
                  disabled={busy}
                  placeholder="Unlimited"
                />
              </FormField>
              <FormField
                label="Daily spend cap (USD)"
                helper="Per UTC day. Blank for unlimited."
              >
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={maxSpendUsd}
                  onChange={(e) => setMaxSpendUsd(e.target.value)}
                  disabled={busy}
                  placeholder="Unlimited"
                />
              </FormField>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                cursor: busy ? "not-allowed" : "pointer",
                background: citeSources ? "var(--bg-elevated)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={citeSources}
                onChange={(e) => setCiteSources(e.target.checked)}
                disabled={busy}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Cite sources</div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    lineHeight: 1.55,
                  }}
                >
                  When on, replies include inline{" "}
                  <code className="mono">[chunk N]</code> markers and a
                  Sources panel. Turn off for public-facing widgets where
                  surfacing internal source paths is inappropriate.
                </div>
              </div>
            </label>

            {error ? <div className="ks-field-error">{error}</div> : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="cta" onClick={onSubmit} loading={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
