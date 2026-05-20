import type { ReactNode } from "react";
import Script from "next/script";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Shell } from "@/components/shell/Shell";
import { SidebarLive } from "@/components/shell/SidebarLive";

/**
 * `(app)` route-group layout. Gated by `RequireAuth` so every nested page
 * can assume a valid CP session; signed-out users bounce to /login from
 * the wrapper instead of each page repeating the check.
 *
 * Note: `CancelledBanner` + `BillingBanner` are mounted inside `<Topbar>`
 * (see `components/shell/Topbar.tsx`) so they stick with the header
 * instead of floating above it without horizontal padding.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Shell sidebar={<SidebarLive />}>{children}</Shell>
      {/*
        Self-demo of the P6 embed widget. Pinned to the signed-in
        layout so it doesn't load on /login or /embed (which would
        recurse). Replace the data-token before pushing to git — this
        is a local-tunnel testnet token, fine for demos but not for
        production builds.
      */}
      <Script
        src="https://dashboard-61.localcan.dev/embed/v1.js"
        data-agent-id="683843af-bbf1-4e62-9137-a0c27644eade"
        data-token="kr_share_test_TeGQ2MxbadD9X8XD5qX9rxZIT9BjE8azBEIz"
        strategy="afterInteractive"
      />
    </RequireAuth>
  );
}
