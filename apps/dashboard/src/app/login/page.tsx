"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Mark } from "@/components/ui/Mark";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { stashPendingInvite, useCpSession, useGoogleSignIn } from "@/lib/auth";
import { ControlPlaneError } from "@/lib/api";
import { GridPulse } from "@/components/auth/GridPulse";
import { InviteCodeInput, fullInviteCode } from "@/components/auth/InviteCodeInput";
import { LoginStoryPanel } from "@/components/auth/LoginStoryPanel";
import { ProviderButton } from "@/components/auth/ProviderButton";

/**
 * Two-pane editorial sign-in.
 * Left (Ink) — rotating story panel of Kraterion's differentiators.
 * Right (Cream) — the actual auth controls.
 *
 * Auth is self-hosted zkLogin: "Continue" redirects to Google, which returns
 * to `/auth/callback` to finish the ceremony. `?reason=stale` indicates the
 * dashboard detected an expired zkLogin session (proof ~days; CP JWT 7 days).
 */
function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { mounted, session } = useCpSession();
  const signIn = useGoogleSignIn();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteBody, setInviteBody] = useState("");
  const [inviteInvalid, setInviteInvalid] = useState(false);

  const stale = params?.get("reason") === "stale";
  // The callback bounces invite failures back here with a message.
  const inviteError = params?.get("invite_error") ?? null;

  useEffect(() => {
    if (mounted && session) router.replace("/buckets");
  }, [mounted, session, router]);

  useEffect(() => {
    if (inviteError) {
      setError(inviteError);
      setInviteInvalid(true);
    }
  }, [inviteError]);

  const onContinue = async () => {
    setError(null);
    setInviteInvalid(false);
    setBusy(true);
    try {
      // Persist the invite code (if any) so it survives the Google redirect and
      // can be read on /auth/callback. Blank is fine for returning users.
      stashPendingInvite(fullInviteCode(inviteBody));
      // Redirects to Google; sign-in completes on /auth/callback. If the
      // redirect is initiated, the code below won't run (page unloads).
      await signIn();
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
      <aside className="ks-login-story" aria-label="About Kraterion">
        <GridPulse />

        <header className="ks-login-story-head ks-brand">
          <Mark size={28} variant="krater" animate="pulse" />
          <span className="ks-wordmark">Kraterion</span>
        </header>

        <LoginStoryPanel />

        <footer className="ks-login-story-foot">
          <div className="ks-login-facts">
            <span>Stored on Walrus</span>
            <span aria-hidden="true">·</span>
            <span>Sealed by you</span>
            <span aria-hidden="true">·</span>
            <span>Owned on Sui</span>
          </div>
          <p className="ks-login-foot-meta">
            <span className="ks-login-foot-dot" aria-hidden="true" />
            Testnet preview · Sui Overflow 2026
          </p>
        </footer>
      </aside>

      <section className="ks-login-auth" aria-label="Sign in">
        <div className="ks-login-auth-inner">
          <div className="ks-login-auth-head">
            <h1 className="ks-login-h1">Sign in</h1>
            <p className="ks-login-sub">
              Continue to your console. One click — no seed phrases, no wallet
              install.
            </p>
          </div>

          {stale ? (
            <Banner
              tone="info"
              title="Session expired"
              body="Your wallet session timed out. Re-authenticate to keep working on-chain."
            />
          ) : null}

          <InviteCodeInput
            value={inviteBody}
            onChange={(b) => {
              setInviteBody(b);
              if (inviteInvalid) setInviteInvalid(false);
            }}
            invalid={inviteInvalid}
            disabled={busy}
          />

          <div className="ks-login-providers">
            <ProviderButton
              provider="google"
              onClick={onContinue}
              loading={busy}
            />
            <ProviderButton provider="github" comingSoon />
          </div>

          {error ? <div className="ks-field-error">{error}</div> : null}

          <div className="ks-login-rule">
            <span>secured by zkLogin</span>
          </div>

          <p className="ks-login-fineprint">
            Your Sui address is derived from your Google account through a
            zero-knowledge proof. Kraterion never sees your password.
          </p>

          <div className="ks-login-legal">
            <Pill>v0.1 · testnet</Pill>
            <span>
              By continuing you agree to the{" "}
              <a href="https://kraterion.com/legal/terms">terms</a> and{" "}
              <a href="https://kraterion.com/legal/privacy">privacy policy</a>.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

// `useSearchParams()` (read for the `?reason=stale` hint) triggers Next 16's
// CSR bailout, which requires a Suspense boundary above it for the static
// prerender. Wrapping here keeps the route statically shippable.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
