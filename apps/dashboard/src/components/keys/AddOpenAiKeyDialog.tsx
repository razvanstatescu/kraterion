"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { useUpsertCredential } from "@/lib/queries";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string | undefined;
  /** When set, dialog is in replace mode — copy nudges that the
   *  previous key will be overwritten and existing chunks unaffected. */
  replacingLast4?: string | null;
}

/**
 * Single-input modal for saving an OpenAI key. The CP pings
 * `/v1/models` before persisting; rejection surfaces as inline copy.
 * On success we drop the plaintext from local state and close.
 */
export function AddOpenAiKeyDialog({ open, onClose, projectId, replacingLast4 }: Props) {
  const { show } = useToast();
  const upsert = useUpsertCredential(projectId);

  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = upsert.isPending;
  const isReplace = Boolean(replacingLast4);

  useEffect(() => {
    if (open) {
      setApiKey("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const onSubmit = async () => {
    const trimmed = apiKey.trim();
    if (trimmed.length < 20) {
      setError("That doesn't look like an OpenAI key. Paste the full value.");
      return;
    }
    if (!projectId) {
      setError("Project isn't ready yet. Try again in a moment.");
      return;
    }
    setError(null);
    try {
      const res = await upsert.mutateAsync({ provider: "openai", api_key: trimmed });
      setApiKey("");
      show({
        tone: "success",
        title: isReplace ? "OpenAI key replaced" : "OpenAI key saved",
        body: `Stored as sk-…${res.credential.key_last_4}. Indexing and search now use this key.`,
      });
      onClose();
    } catch (err) {
      if (err instanceof ControlPlaneError && err.code === "InvalidArgument") {
        setError(
          "OpenAI rejected this key. Check it on platform.openai.com and try again.",
        );
        return;
      }
      const message =
        err instanceof Error ? err.message : "Couldn't save the key. Try again.";
      setError(message);
    }
  };

  return (
    <Portal>
    <div className="ks-modal-scrim" onClick={busy ? undefined : onClose}>
      <div
        className="ks-modal"
        style={{ width: 560, maxWidth: "calc(100vw - 32px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ks-modal-head">
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {isReplace ? "Replace OpenAI key" : "Add OpenAI key"}
          </div>
          <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FormField
            label="OpenAI API key"
            helper={
              isReplace
                ? `Replaces sk-…${replacingLast4}. Existing chunks stay queryable.`
                : "Used for indexing and search. Stored encrypted; only the last 4 chars shown after save."
            }
            required
          >
            <Input
              autoFocus
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              disabled={busy}
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void onSubmit();
              }}
            />
          </FormField>
          {error ? <div className="ks-field-error">{error}</div> : null}
          <p className="lead" style={{ fontSize: 13 }}>
            We validate the key against OpenAI before saving. If validation
            fails the key is not stored.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="cta" onClick={onSubmit} loading={busy}>
              {busy ? "Saving…" : isReplace ? "Replace key" : "Save key"}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
