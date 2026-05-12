"use client";

import { useAutoConnectWallet, useCurrentWallet } from "@mysten/dapp-kit";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { sessionStorage as cpSessionStore } from "@/lib/api";
import { useCpSession } from "@/lib/auth";

/**
 * Client gate for the `(app)` route group.
 *
 * Two layers of session:
 *
 *   1. The CP-issued HS256 JWT in `localStorage` — 7 day TTL. Authorizes
 *      our backend calls.
 *   2. The Enoki zkLogin session in IndexedDB — much shorter (~1 day,
 *      tied to Google's id_token lifetime). Required for *signing*
 *      transactions on-chain.
 *
 * Coming back after a day, layer 1 may still be valid while layer 2 has
 * silently logged out (see `node_modules/@mysten/enoki/dist/wallet/state.mjs`
 * — `getSession()` calls `logout()` when `expiresAt < Date.now()`). The
 * dashboard would otherwise render normally and only error out when the
 * user clicks a button that calls `useSignTransaction`, throwing
 * `WalletNotConnectedError: No wallet is connected.`
 *
 * The fix: once dApp Kit's autoConnect attempt has settled, treat a
 * missing wallet connection as a stale session. Clear the CP JWT and
 * bounce to /login so the user re-grants Google. Status values come from
 * `useAutoConnectWallet()` — `"idle"` means the attempt hasn't completed
 * yet, so we hold off on any redirect to avoid flapping during boot.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { mounted, session } = useCpSession();
  const autoConnectStatus = useAutoConnectWallet();
  const { isConnected } = useCurrentWallet();

  // CP session missing → straight to /login (the original path).
  useEffect(() => {
    if (mounted && !session) router.replace("/login");
  }, [mounted, session, router]);

  // CP session present but wallet wouldn't reconnect → stale. Drop the
  // CP JWT so /login takes the user through a fresh OAuth round-trip.
  // `"disabled"` shouldn't occur (we always pass autoConnect=true), but
  // we treat it the same as `"attempted"` for safety.
  useEffect(() => {
    if (!mounted || !session) return;
    if (autoConnectStatus !== "attempted" && autoConnectStatus !== "disabled") return;
    if (!isConnected) {
      cpSessionStore.clear();
      router.replace("/login?reason=stale");
    }
  }, [mounted, session, autoConnectStatus, isConnected, router]);

  if (!mounted) return null;
  if (!session) return null;
  // Block render until the autoConnect outcome is known. Without this
  // gate the app shell renders for a frame and then `useSignTransaction`
  // can fire against a not-yet-connected wallet.
  if (autoConnectStatus === "idle") return null;
  if (!isConnected) return null;
  return <>{children}</>;
}
