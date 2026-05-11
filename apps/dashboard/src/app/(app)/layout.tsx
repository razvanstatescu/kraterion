import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CancelledBanner } from "@/components/shell/CancelledBanner";
import { Shell } from "@/components/shell/Shell";
import { SidebarLive } from "@/components/shell/SidebarLive";

/**
 * `(app)` route-group layout. Gated by `RequireAuth` so every nested page
 * can assume a valid CP session; signed-out users bounce to /login from
 * the wrapper instead of each page repeating the check.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Shell sidebar={<SidebarLive />}>
        <CancelledBanner />
        {children}
      </Shell>
    </RequireAuth>
  );
}
