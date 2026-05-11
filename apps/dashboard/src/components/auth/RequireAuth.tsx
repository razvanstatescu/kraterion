"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useCpSession } from "@/lib/auth";

/**
 * Client gate for the `(app)` route group.
 *
 * Until we know whether the user has a session (i.e. before client mount),
 * we render nothing — better than rendering the shell and then flashing
 * back to /login. The hydration boundary keeps SSR markup and first
 * client paint identical (`mounted=false` on both).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { mounted, session } = useCpSession();

  useEffect(() => {
    if (mounted && !session) router.replace("/login");
  }, [mounted, session, router]);

  if (!mounted) return null;
  if (!session) return null;
  return <>{children}</>;
}
