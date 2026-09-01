"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type AgentJson } from "@/lib/api";
import { env } from "@/lib/env";
import { suiscanAddressUrl, suiscanObjectUrl, suiscanTxUrl } from "@/lib/format";
import { useAgentGrants } from "@/lib/queries";
import { useSponsoredTx } from "@/lib/sponsor";

interface Props {
  agent: AgentJson;
}

/**
 * Agent detail "Connect" tab. Three sections:
 *
 *   1. **On-chain access** — per-bucket grant status with Grant /
 *      Revoke buttons. Each Grant fires a sponsored
 *      `grant_api_access(bucket, agent_addr)` Move call (operator-sponsored);
 *      each Revoke fires the per-address emulated revoke
 *      (`revoke_all + grant(survivors)`). Status comes from a live
 *      Sui RPC read so the user sees the actual chain state, not a
 *      DB shadow.
 *   2. **Sub-wallet address** — the agent's on-chain identity, linked
 *      to Suiscan.
 *   3. **OpenAI-compatible endpoint** — curl example + base URL hint
 *      so any OpenAI SDK consumer can drop in `base_url + agent_id`.
 */
export function AgentConnectPanel({ agent }: Props) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const runSponsored = useSponsoredTx();
  const { data, isLoading, error } = useAgentGrants(agent.id);
  // Track which (action, bucket_id) is in flight so per-row buttons
  // show a loading state independently of one another.
  const [pending, setPending] = useState<{ action: "grant" | "revoke"; bucketId: string } | null>(
    null,
  );

  const fireGrant = async (bucketId: string, bucketName: string) => {
    setPending({ action: "grant", bucketId });
    try {
      const res = await runSponsored({
        prepareEndpoint: `/v1/buckets/${bucketId}/prepare-grant-agent`,
        body: { agent_id: agent.id },
      });
      show({
        tone: "success",
        title: `Granted on "${bucketName}"`,
        body: (
          <>
            On-chain access added.{" "}
            <a
              href={suiscanTxUrl(res.digest, env.network)}
              target="_blank"
              rel="noreferrer"
            >
              View on Suiscan
            </a>
          </>
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", "grants", agent.id],
      });
    } catch (err) {
      show({
        tone: "error",
        title: `Couldn't grant on "${bucketName}"`,
        body:
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Try again.",
      });
    } finally {
      setPending(null);
    }
  };

  const fireRevoke = async (bucketId: string, bucketName: string) => {
    setPending({ action: "revoke", bucketId });
    try {
      const res = await runSponsored({
        prepareEndpoint: `/v1/buckets/${bucketId}/prepare-revoke-agent`,
        body: { agent_id: agent.id },
      });
      show({
        tone: "success",
        title: `Revoked from "${bucketName}"`,
        body: (
          <>
            On-chain access removed.{" "}
            <a
              href={suiscanTxUrl(res.digest, env.network)}
              target="_blank"
              rel="noreferrer"
            >
              View on Suiscan
            </a>
          </>
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: ["v1", "agents", "grants", agent.id],
      });
    } catch (err) {
      show({
        tone: "error",
        title: `Couldn't revoke from "${bucketName}"`,
        body:
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Try again.",
      });
    } finally {
      setPending(null);
    }
  };

  const cpUrl = env.controlPlaneUrl;
  const endpoint = `/v1/agents/${agent.id}/chat/completions`;
  const curl = `curl -X POST '${cpUrl}${endpoint}' \\
  -H 'Authorization: Bearer kr_test_<your-token>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "messages": [{ "role": "user", "content": "What does the latest contract say about indemnity?" }],
    "stream": false
  }'

# Mint a token from /keys → "API tokens". One token works across the
# CRUD API, agent chat, knowledge search, and MCP — same as Stripe's
# sk_live_/sk_test_ pattern.`;

  const allGranted =
    data &&
    data.grants.length > 0 &&
    data.grants.every((g) => g.granted_on_chain);
  const someUngranted =
    data && data.grants.some((g) => !g.granted_on_chain);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        maxWidth: 760,
      }}
    >
      {/* === On-chain access section === */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              On-chain access
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              The agent&apos;s sub-wallet must be on each bucket&apos;s{" "}
              <code>api_decryption_addresses</code> list to decrypt its
              contents. Grant fires a sponsored Move call; revoke
              emulates per-address removal (
              <code>revoke_all</code> + re-grant survivors) in one PTB.
            </div>
          </div>
          {agent.status === "revoked" ? (
            <Pill tone="error" dot>
              Agent revoked
            </Pill>
          ) : allGranted ? (
            <Pill tone="success" dot>
              All granted
            </Pill>
          ) : someUngranted ? (
            <Pill tone="warning" dot>
              Pending grants
            </Pill>
          ) : null}
        </div>

        <div>
          {error ? (
            <div style={{ padding: 16 }}>
              <Banner
                tone="error"
                title="Couldn't load on-chain status"
                body={
                  error instanceof ControlPlaneError
                    ? error.message
                    : "Try again in a moment."
                }
              />
            </div>
          ) : isLoading ? (
            <div
              className="muted"
              style={{ padding: 16, fontSize: 13 }}
            >
              Checking on-chain status…
            </div>
          ) : !data || data.grants.length === 0 ? (
            <div
              className="muted"
              style={{ padding: 20, fontSize: 13 }}
            >
              This agent has no buckets attached.{" "}
              <Link href={`/agents/${agent.id}?tab=settings`}>
                Attach one on the Settings tab.
              </Link>
            </div>
          ) : (
            data.grants.map((g, i) => {
              const granted = g.granted_on_chain;
              const inFlight = pending?.bucketId === g.bucket_id;
              const grantBusy = inFlight && pending.action === "grant";
              const revokeBusy = inFlight && pending.action === "revoke";
              return (
                <div
                  key={g.bucket_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "20px minmax(0, 1fr) auto",
                    columnGap: 12,
                    alignItems: "center",
                    padding: "14px 24px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <Icon
                    name="bucket"
                    size={16}
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g.bucket_name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      {granted ? (
                        <Pill tone="success" dot>
                          Granted
                        </Pill>
                      ) : (
                        <Pill tone="neutral" dot>
                          Not granted
                        </Pill>
                      )}
                      <a
                        href={suiscanObjectUrl(
                          g.kraterion_bucket_object_id,
                          env.network,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          textDecoration: "none",
                        }}
                      >
                        On-chain object ↗
                      </a>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {granted ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void fireRevoke(g.bucket_id, g.bucket_name)}
                        loading={revokeBusy}
                        disabled={Boolean(pending) && !inFlight}
                        style={{ color: "var(--error)" }}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void fireGrant(g.bucket_id, g.bucket_name)}
                        loading={grantBusy}
                        disabled={
                          agent.status === "revoked" ||
                          (Boolean(pending) && !inFlight)
                        }
                      >
                        Grant
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* === Sub-wallet section === */}
      <Card style={{ padding: 20 }}>
        <div className="micro" style={{ marginBottom: 6 }}>
          Sub-wallet
        </div>
        <div className="ks-codeline mono" style={{ cursor: "default" }}>
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {agent.sub_wallet_address}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <div
            className="muted"
            style={{ fontSize: 12, maxWidth: 540 }}
          >
            Each agent ships with its own Sui sub-wallet. KMS-wrapped
            seed; this address is the stable on-chain identity used by
            grant + revoke flows above.
          </div>
          <a
            href={suiscanAddressUrl(agent.sub_wallet_address, env.network)}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, textDecoration: "none" }}
          >
            View on Suiscan ↗
          </a>
        </div>
      </Card>

      {/* === HTTP endpoint section === */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          OpenAI-compatible endpoint
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          Drop any OpenAI SDK at{" "}
          <code>base_url = {cpUrl}/v1/agents/{agent.id}</code>{" "}
          with an API key issued from <Link href="/keys">Access keys</Link>.
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="micro" style={{ marginBottom: 6 }}>
            Endpoint
          </div>
          <div className="ks-codeline mono">
            <span style={{ flex: 1, overflow: "auto" }}>POST {endpoint}</span>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="micro" style={{ marginBottom: 6 }}>
            Curl example
          </div>
          <pre
            className="mono"
            style={{
              fontSize: 12,
              padding: 14,
              background: "var(--ink)",
              color: "var(--cream)",
              borderRadius: "var(--radius-md)",
              overflow: "auto",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {curl}
          </pre>
        </div>
      </Card>
    </div>
  );
}
