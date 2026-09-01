"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ControlPlaneError } from "@/lib/api";
import { finishSignInFromCallback } from "@/lib/auth";

/**
 * Google OAuth redirect target. Google returns the id_token in the URL
 * fragment (`#id_token=…`); we finish the zkLogin ceremony, sign in to the
 * control-plane, and route into the app.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const idToken = hash.get("id_token");
    const oauthError = hash.get("error");
    if (oauthError) {
      setError(`Google returned an error: ${oauthError}`);
      return;
    }
    if (!idToken) {
      setError("No id_token returned by Google. Start sign-in again.");
      return;
    }
    finishSignInFromCallback(idToken)
      .then(() => router.replace("/buckets"))
      .catch((e: unknown) => {
        // Invite failures are recoverable — bounce back to /login with the
        // message so the user can enter a valid code and retry.
        const reason =
          e instanceof ControlPlaneError ? e.details?.["reason"] : undefined;
        if (reason === "invite_required" || reason === "invite_invalid") {
          const msg = e instanceof Error ? e.message : "A valid invite code is required.";
          router.replace(`/login?invite_error=${encodeURIComponent(msg)}`);
          return;
        }
        setError(e instanceof Error ? e.message : "Sign-in didn't complete.");
      });
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      {error ? (
        <div>
          <p>Sign-in failed.</p>
          <p style={{ opacity: 0.7 }}>{error}</p>
          <a href="/login">Back to sign-in</a>
        </div>
      ) : (
        <p>Finishing sign-in…</p>
      )}
    </main>
  );
}
