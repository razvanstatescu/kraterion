"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { sessionStorage as cpSessionStore } from "@/lib/api";
import { useCpSession } from "@/lib/auth";
import { getZkSession } from "@/lib/zklogin";

/**
 * Client gate for the `(app)` route group.
 *
 * Two layers of session:
 *   1. The CP-issued HS256 JWT in `localStorage` (7-day TTL) — authorizes
 *      backend calls.
 *   2. The self-hosted zkLogin session in `localStorage` — required for
 *      *signing* transactions (holds the ephemeral key + jwt + salt).
 *
 * Coming back after the id_token has expired, layer 1 may still be valid
 * while layer 2 is gone. Without a check the app renders normally and only
 * errors when the user clicks a sign action. So: if the CP session is present
 * but the zkLogin session is missing, treat it as stale — clear the CP JWT
 * and bounce to /login for a fresh Google round-trip.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { mounted, session } = useCpSession();
  const [zkChecked, setZkChecked] = useState(false);
  const [hasZk, setHasZk] = useState(false);

  useEffect(() => {
    setHasZk(getZkSession() !== null);
    setZkChecked(true);
  }, []);

  // CP session missing → straight to /login.
  useEffect(() => {
    if (mounted && !session) router.replace("/login");
  }, [mounted, session, router]);

  // CP session present but zkLogin session gone → stale. Drop the CP JWT so
  // /login takes the user through a fresh OAuth round-trip.
  useEffect(() => {
    if (!mounted || !session || !zkChecked) return;
    if (!hasZk) {
      cpSessionStore.clear();
      router.replace("/login?reason=stale");
    }
  }, [mounted, session, zkChecked, hasZk, router]);

  if (!mounted || !zkChecked) return null;
  if (!session || !hasZk) return null;
  return <>{children}</>;
}
