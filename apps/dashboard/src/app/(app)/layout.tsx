import type { ReactNode } from "react";
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
    </RequireAuth>
  );
}
