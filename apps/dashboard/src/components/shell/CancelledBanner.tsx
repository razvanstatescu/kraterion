"use client";

import { Banner } from "@/components/ui/Banner";
import { useCpSession } from "@/lib/auth";
import { suiscanObjectUrl } from "@/lib/format";
import { env } from "@/lib/env";
import { useMe } from "@/lib/queries";

/**
 * Persistent banner shown on every (app) page once the account is
 * cancelled. Demo "twist 1" — proves the user's data outlives the
 * platform. Tap-through goes to the on-chain address on Suiscan.
 */
export function CancelledBanner() {
  const { mounted } = useCpSession();
  const { data } = useMe();
  if (!mounted || !data || data.account.status !== "cancelled") return null;
  return (
    <div className="ks-cancelled-banner">
      <Banner
        tone="warning"
        title="Subscription cancelled"
        body={
          <>
            Your files remain on-chain at{" "}
            <a
              className="ks-cancelled-link"
              href={suiscanObjectUrl(data.account.sui_address, env.network)}
              target="_blank"
              rel="noreferrer"
            >
              {data.account.sui_address}
            </a>
            . Anyone can fund their storage from the CLI — Kraterion can't take them away.
          </>
        }
      />
    </div>
  );
}
