"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Mark } from "@/components/ui/Mark";
import { useToast } from "@/components/ui/Toast";
import { useCpSession, useGoogleSignIn } from "@/lib/auth";
import { ControlPlaneError } from "@/lib/api";

/**
 * Marketing-style single-column sign-in. The whole flow is one click —
 * Enoki opens the Google popup and returns the JWT directly to the SDK.
 */
export default function LoginPage() {
  const router = useRouter();
  const { mounted, session } = useCpSession();
  const signIn = useGoogleSignIn();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → bounce to the app.
  useEffect(() => {
    if (mounted && session) router.replace("/buckets");
  }, [mounted, session, router]);

  const onContinue = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await signIn();
      show({
        tone: "success",
        title: res.created ? "Welcome to Kraterion" : "Welcome back",
        body: `Signed in as ${res.account.email}.`,
      });
      router.replace("/buckets");
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Sign-in didn't complete. Try again.";
      setError(message);
      setBusy(false);
    }
  };

  return (
    <main className="ks-login">
      <div className="ks-login-card">
        <Mark size={56} variant="light" />
        <div>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>Kraterion</h1>
          <p className="lead">Object storage you actually own.</p>
        </div>

        <Button
          variant="cta"
          size="lg"
          onClick={onContinue}
          loading={busy}
          style={{ minWidth: 240 }}
        >
          {busy ? "Signing in…" : "Continue with Google"}
        </Button>

        {error ? (
          <div className="ks-field-error" style={{ maxWidth: 360 }}>
            {error}
          </div>
        ) : null}

        <p className="muted" style={{ fontSize: 13, maxWidth: 360 }}>
          We use zkLogin via Mysten Labs Enoki. Your Sui address is derived
          from your Google account — no seed phrases, no wallet install.
        </p>
      </div>
    </main>
  );
}
