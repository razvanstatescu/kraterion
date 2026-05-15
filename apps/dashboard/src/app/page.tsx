"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Mark } from "@/components/ui/Mark";
import { useCpSession } from "@/lib/auth";

/**
 * Root: bounce to /buckets if signed in, /login otherwise. Renders the
 * brand mark in the interim — short-lived flash, but avoids a blank
 * screen during hydration.
 */
export default function Home() {
  const router = useRouter();
  const { mounted, session } = useCpSession();

  useEffect(() => {
    if (!mounted) return;
    router.replace(session ? "/buckets" : "/login");
  }, [mounted, session, router]);

  return (
    <main className="ks-splash">
      <Mark size={64} variant="light" animate="pulse" />
    </main>
  );
}
