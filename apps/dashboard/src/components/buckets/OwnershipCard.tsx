"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { BucketJson } from "@/lib/api";
import { useCpSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { suiscanAddressUrl, suiscanObjectUrl } from "@/lib/format";

interface Props {
  bucket: BucketJson;
}

/**
 * Tier-2 "Ownership" card on the bucket detail page.
 *
 * Surfaces the Kraterion differentiator (user-owned, revocable
 * platform access) in a way web2 users can ignore and web3 users can
 * verify:
 *   - Owner Sui address. "(you)" badge when it matches the signed-in
 *     session. Clickable → Suiscan.
 *   - On-chain bucket object id. Clickable → Suiscan.
 *   - Current `api_decryption_addresses` rendered as pills with
 *     friendly labels (gateway / Knowledge indexer / Other) so the
 *     user sees who *can* read this bucket right now.
 *
 * The data comes from a single Sui RPC the CP makes on the bucket
 * detail endpoint — see `BucketsController.readBucketChainFields`.
 * If the RPC fails the card hides itself.
 */
export function OwnershipCard({ bucket }: Props) {
  const { session } = useCpSession();
  if (!bucket.owner_address) return null;

  const owner = bucket.owner_address;
  const isYou =
    session?.suiAddress.toLowerCase() === owner.toLowerCase();
  const network = env.network;

  return (
    <details className="ks-ownership-details">
      <summary className="ks-ownership-summary">
        <span className="ks-ownership-summary-label">Ownership</span>
        <span className="ks-ownership-summary-teaser">
          <span className="ks-onchain-mono">{shortAddress(owner)}</span>
          {isYou ? <YouBadge /> : null}
          <span className="ks-ownership-summary-hint">
            owns this bucket on chain
          </span>
        </span>
      </summary>

      <div className="ks-ownership-grid">
        <div className="ks-ownership-row">
          <span className="ks-ownership-key">Owner</span>
          <span className="ks-ownership-value">
            <a
              href={suiscanAddressUrl(owner, network)}
              target="_blank"
              rel="noreferrer"
              className="ks-onchain-mono ks-ownership-link"
              title={owner}
            >
              {shortAddress(owner)}
              <Icon name="arrow-up-right" size={14} />
            </a>
            {isYou ? <YouBadge /> : null}
          </span>
        </div>

        <div className="ks-ownership-row">
          <span className="ks-ownership-key">Bucket object</span>
          <span className="ks-ownership-value">
            <a
              href={suiscanObjectUrl(bucket.kraterion_bucket_object_id, network)}
              target="_blank"
              rel="noreferrer"
              className="ks-onchain-mono ks-ownership-link"
              title={bucket.kraterion_bucket_object_id}
            >
              {shortAddress(bucket.kraterion_bucket_object_id)}
              <Icon name="arrow-up-right" size={14} />
            </a>
          </span>
        </div>

        {bucket.api_decryption_addresses ? (
          <div className="ks-ownership-row">
            <span className="ks-ownership-key">Platform access</span>
            <span className="ks-ownership-value ks-ownership-grants">
              {bucket.api_decryption_addresses.length === 0 ? (
                <span className="muted small">
                  No platform addresses granted — SDK + indexer are
                  cut off.
                </span>
              ) : (
                bucket.api_decryption_addresses.map((addr) => (
                  <AccessPill key={addr} address={addr} network={network} />
                ))
              )}
            </span>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function AccessPill({
  address,
  network,
}: {
  address: string;
  network: "testnet" | "mainnet" | "devnet";
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore non-secure context */
    }
  };
  return (
    <a
      href={suiscanAddressUrl(address, network)}
      target="_blank"
      rel="noreferrer"
      className="ks-access-pill"
      title={`${address} — click to open on Suiscan, ⌥-click to copy`}
      onClick={(e) => (e.altKey ? onCopy(e) : undefined)}
    >
      <Icon name="key" size={14} />
      {shortAddress(address)}
      {copied ? <span className="ks-access-pill-copied">copied</span> : null}
    </a>
  );
}

function YouBadge() {
  return <span className="ks-you-badge">you</span>;
}

function shortAddress(addr: string): string {
  const clean = addr.startsWith("0x") ? addr : `0x${addr}`;
  if (clean.length <= 14) return clean;
  return `${clean.slice(0, 8)}…${clean.slice(-6)}`;
}
