"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { CreateApiKeyDialog } from "@/components/keys/CreateApiKeyDialog";
import { CreateBearerTokenDialog } from "@/components/keys/CreateBearerTokenDialog";
import { ProviderCredentialsTab } from "@/components/keys/ProviderCredentialsTab";
import { QuickstartCode } from "@/components/keys/QuickstartCode";
import { BearerQuickstartCode } from "@/components/keys/BearerQuickstartCode";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type ApiKeyJson } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useApiKeys, useMe, useRevokeApiKey } from "@/lib/queries";

type Tab = "tokens" | "access" | "providers";

const TAB_LABELS: Record<Tab, string> = {
  tokens: "API tokens",
  access: "S3 access keys",
  providers: "AI providers",
};

export default function KeysPage() {
  return (
    <Suspense fallback={null}>
      <KeysPageInner />
    </Suspense>
  );
}

function KeysPageInner() {
  const { data: me } = useMe();
  const projectId = me?.projects[0]?.id;
  const params = useSearchParams();
  const param = params.get("tab");
  const initialTab: Tab =
    param === "access" ? "access" : param === "providers" ? "providers" : "tokens";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [createBearerOpen, setCreateBearerOpen] = useState(false);
  const [createS3Open, setCreateS3Open] = useState(false);

  return (
    <>
      <Topbar
        crumbs={[{ label: TAB_LABELS[tab] }]}
        actions={
          <>
            {tab === "tokens" ? (
              <Button variant="cta" icon="plus" onClick={() => setCreateBearerOpen(true)}>
                New token
              </Button>
            ) : null}
            {tab === "access" ? (
              <Button variant="cta" icon="plus" onClick={() => setCreateS3Open(true)}>
                New key
              </Button>
            ) : null}
            <SignOutButton />
          </>
        }
      />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Keys</h1>
            <p
              className="lead"
              style={{ fontSize: 14, marginTop: 4, maxWidth: 720 }}
            >
              {tab === "tokens"
                ? "One token works across the whole API. Paste it anywhere you'd paste an API key."
                : tab === "access"
                  ? "Access keys work only with S3 clients like boto3, aws-cli, and rclone. They aren't interchangeable with API tokens."
                  : "Credentials for AI providers, scoped to this project. We store them encrypted and use them on your behalf."}
            </p>
          </div>
        </div>

        <div className="ks-subtabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "tokens"}
            className={`ks-subtab${tab === "tokens" ? " is-active" : ""}`}
            onClick={() => setTab("tokens")}
            type="button"
          >
            <Icon name="key" size={14} />
            API tokens
          </button>
          <button
            role="tab"
            aria-selected={tab === "access"}
            className={`ks-subtab${tab === "access" ? " is-active" : ""}`}
            onClick={() => setTab("access")}
            type="button"
          >
            <Icon name="key" size={14} />
            S3 access keys
          </button>
          <button
            role="tab"
            aria-selected={tab === "providers"}
            className={`ks-subtab${tab === "providers" ? " is-active" : ""}`}
            onClick={() => setTab("providers")}
            type="button"
          >
            <Icon name="key" size={14} />
            AI providers
          </button>
        </div>

        {tab === "tokens" ? (
          <BearerTokensTab projectId={projectId} onCreate={() => setCreateBearerOpen(true)} />
        ) : tab === "access" ? (
          <AccessKeysTab projectId={projectId} onCreate={() => setCreateS3Open(true)} />
        ) : (
          <ProviderCredentialsTab projectId={projectId} />
        )}
      </main>

      <CreateBearerTokenDialog
        open={createBearerOpen}
        onClose={() => setCreateBearerOpen(false)}
        projectId={projectId}
      />
      <CreateApiKeyDialog
        open={createS3Open}
        onClose={() => setCreateS3Open(false)}
        projectId={projectId}
      />
    </>
  );
}

function BearerTokensTab({
  projectId,
  onCreate,
}: {
  projectId: string | undefined;
  onCreate: () => void;
}) {
  const { data, error, isLoading } = useApiKeys(projectId);
  const revoke = useRevokeApiKey(projectId);
  const { show } = useToast();

  const [confirmRevoke, setConfirmRevoke] = useState<ApiKeyJson | null>(null);

  const keys = (data?.api_keys ?? []).filter((k) => k.kind === "bearer");
  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  const onRevoke = async () => {
    if (!confirmRevoke) return;
    try {
      await revoke.mutateAsync(confirmRevoke.id);
      show({
        tone: "success",
        title: `Revoked "${confirmRevoke.name}"`,
        body: "Calls using this token will start failing immediately.",
      });
      setConfirmRevoke(null);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't revoke. Try again.";
      show({ tone: "error", title: "Revoke failed", body: message });
    }
  };

  if (error) {
    return (
      <Banner
        tone="error"
        title="Failed to load tokens"
        body={error instanceof ControlPlaneError ? error.message : "Try again in a moment."}
      />
    );
  }
  if (isLoading) {
    return <div className="muted" style={{ fontSize: 14 }}>Loading…</div>;
  }
  if (keys.length === 0) {
    return (
      <EmptyState
        icon="key"
        title="No API tokens yet"
        body="Mint one to start calling the API from scripts, CI, or third-party agents."
        action={
          <Button variant="cta" icon="plus" onClick={onCreate}>
            New token
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 32 }}>
        <div className="ks-table" style={{ border: "none", borderRadius: 0 }}>
          <div className="ks-thead">
            <div style={{ flex: "2 1 0" }}>Name</div>
            <div style={{ flex: "2 1 0" }}>Token</div>
            <div style={{ flex: "1 1 0" }}>Network</div>
            <div style={{ flex: "1 1 0" }}>Status</div>
            <div style={{ flex: "1 1 0" }}>Last used</div>
            <div style={{ width: 88 }} />
          </div>
          {[...active, ...revoked].map((k) => {
            const revokedStatus = Boolean(k.revoked_at);
            return (
              <div
                key={k.id}
                className="ks-trow"
                style={{ cursor: "default", opacity: revokedStatus ? 0.55 : 1 }}
              >
                <div
                  style={{
                    flex: "2 1 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <Icon
                    name="key"
                    size={16}
                    style={{ color: "var(--text-secondary)", flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {k.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      created {formatRelative(k.created_at)}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    flex: "2 1 0",
                    fontFamily:
                      "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {k.token_prefix ?? "—"}
                </div>
                <div style={{ flex: "1 1 0" }}>
                  {k.network ? (
                    <Pill tone={k.network === "mainnet" ? "success" : "info"} dot>
                      {k.network}
                    </Pill>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>—</span>
                  )}
                </div>
                <div style={{ flex: "1 1 0" }}>
                  {revokedStatus ? (
                    <Pill tone="error" dot>Revoked</Pill>
                  ) : (
                    <Pill tone="success" dot>Active</Pill>
                  )}
                </div>
                <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>
                  {k.last_used_at ? formatRelative(k.last_used_at) : "—"}
                </div>
                <div
                  style={{
                    width: 88,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  {revokedStatus ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRevoke(k)}
                      style={{ color: "var(--error)" }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {active[0] ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 500 }}>Quickstart</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              Snippets for {active[0].name}. The token was shown only at
              creation — mint a new one to see it again.
            </span>
          </div>
          <BearerQuickstartCode token={null} />
        </>
      ) : null}

      <ConfirmModal
        open={confirmRevoke !== null}
        onCancel={() => (revoke.isPending ? undefined : setConfirmRevoke(null))}
        onConfirm={onRevoke}
        busy={revoke.isPending}
        danger
        confirmLabel={revoke.isPending ? "Revoking…" : "Revoke token"}
        title={`Revoke "${confirmRevoke?.name ?? ""}"?`}
        body={
          <>
            <p>
              Once revoked, this token stops working immediately. Any script,
              CI job, or agent using it will start receiving
              <code> 401 Unauthorized</code>.
            </p>
            <p style={{ marginTop: 8 }}>
              You can&apos;t un-revoke — mint a new token if you need continued
              access.
            </p>
          </>
        }
      />
    </>
  );
}

function AccessKeysTab({
  projectId,
  onCreate,
}: {
  projectId: string | undefined;
  onCreate: () => void;
}) {
  const { data, error, isLoading } = useApiKeys(projectId);
  const revoke = useRevokeApiKey(projectId);
  const { show } = useToast();

  const [confirmRevoke, setConfirmRevoke] = useState<ApiKeyJson | null>(null);

  const keys = (data?.api_keys ?? []).filter((k) => k.kind === "s3");
  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  const onRevoke = async () => {
    if (!confirmRevoke) return;
    try {
      await revoke.mutateAsync(confirmRevoke.id);
      show({
        tone: "success",
        title: `Revoked "${confirmRevoke.name}"`,
        body: "SDK clients using this key will start failing within seconds.",
      });
      setConfirmRevoke(null);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't revoke. Try again.";
      show({ tone: "error", title: "Revoke failed", body: message });
    }
  };

  if (error) {
    return (
      <Banner
        tone="error"
        title="Failed to load keys"
        body={error instanceof ControlPlaneError ? error.message : "Try again in a moment."}
      />
    );
  }
  if (isLoading) {
    return <div className="muted" style={{ fontSize: 14 }}>Loading…</div>;
  }
  if (keys.length === 0) {
    return (
      <EmptyState
        icon="key"
        title="No access keys yet"
        body="Mint one to start uploading from boto3, aws-cli, or rclone."
        action={
          <Button variant="cta" icon="plus" onClick={onCreate}>
            New key
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 32 }}>
        <div className="ks-table" style={{ border: "none", borderRadius: 0 }}>
          <div className="ks-thead">
            <div style={{ flex: "2 1 0" }}>Name</div>
            <div style={{ flex: "2 1 0" }}>Key id</div>
            <div style={{ flex: "1 1 0" }}>Status</div>
            <div style={{ flex: "1 1 0" }}>Last used</div>
            <div style={{ width: 88 }} />
          </div>
          {[...active, ...revoked].map((k) => {
            const revokedStatus = Boolean(k.revoked_at);
            return (
              <div
                key={k.id}
                className="ks-trow"
                style={{ cursor: "default", opacity: revokedStatus ? 0.55 : 1 }}
              >
                <div
                  style={{
                    flex: "2 1 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <Icon
                    name="key"
                    size={16}
                    style={{ color: "var(--text-secondary)", flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {k.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      created {formatRelative(k.created_at)}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    flex: "2 1 0",
                    fontFamily:
                      "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {k.access_key_id ?? "—"}
                </div>
                <div style={{ flex: "1 1 0" }}>
                  {revokedStatus ? (
                    <Pill tone="error" dot>Revoked</Pill>
                  ) : (
                    <Pill tone="success" dot>Active</Pill>
                  )}
                </div>
                <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>
                  {k.last_used_at ? formatRelative(k.last_used_at) : "—"}
                </div>
                <div
                  style={{
                    width: 88,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  {revokedStatus ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRevoke(k)}
                      style={{ color: "var(--error)" }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {active[0]?.access_key_id ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 500 }}>Quickstart</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              Snippets for {active[0].name}. The secret was shown only at
              creation — mint a new key to see it again.
            </span>
          </div>
          <QuickstartCode accessKeyId={active[0].access_key_id} secret={null} />
        </>
      ) : null}

      <ConfirmModal
        open={confirmRevoke !== null}
        onCancel={() => (revoke.isPending ? undefined : setConfirmRevoke(null))}
        onConfirm={onRevoke}
        busy={revoke.isPending}
        danger
        confirmLabel={revoke.isPending ? "Revoking…" : "Revoke key"}
        title={`Revoke "${confirmRevoke?.name ?? ""}"?`}
        body={
          <>
            <p>
              Once revoked, this key stops working immediately. boto3 / aws-cli /
              rclone clients using it will start failing with
              <code> InvalidAccessKeyId</code> or
              <code> SignatureDoesNotMatch</code>.
            </p>
            <p style={{ marginTop: 8 }}>
              You can&apos;t un-revoke — mint a new key if you need continued
              access.
            </p>
          </>
        }
      />
    </>
  );
}
