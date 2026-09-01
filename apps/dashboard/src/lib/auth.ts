"use client";

/**
 * Sign-in / sign-out / session-read hooks (self-hosted zkLogin, no Enoki).
 *
 * Sign-in is a redirect flow:
 *   1. `useGoogleSignIn()` → `beginGoogleSignIn()` builds the zkLogin nonce
 *      and redirects to Google (response_type=id_token).
 *   2. Google returns to `/auth/callback` with an id_token in the URL hash.
 *   3. `finishSignInFromCallback(idToken)` persists the zkLogin session,
 *      POSTs the token to `/v1/auth/zklogin` (the CP verifies it locally and
 *      returns our session JWT), and stores the CP session.
 *
 * `useCpSession` reads localStorage with a useEffect-mounted gate so
 * SSR/client first-paint never disagree. Listens for cross-tab `storage`
 * events so sign-out in one tab kicks the others to /login.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  cpFetch,
  sessionStorage as cpSessionStore,
  type AccountJson,
  type ProjectJson,
  type StoredSession,
} from "./api";
import { beginGoogleSignIn, clearZkSession, completeGoogleSignIn } from "./zklogin";

interface ZkLoginResponse {
  account: AccountJson;
  project: { id: string; name: string };
  token: string;
  created: boolean;
  akia?: string;
  secret?: string;
  api_key_id?: string;
}

// The invite code is collected on /login but consumed on /auth/callback after
// the Google round-trip, so it has to survive a full-page redirect. localStorage
// (not sessionStorage) because some browsers drop session storage across the
// top-level OAuth navigation.
const INVITE_PENDING_KEY = "kr.invite.pending";

/** Persist an invite code before redirecting to Google. Clears if empty. */
export function stashPendingInvite(code: string): void {
  if (typeof window === "undefined") return;
  if (code) window.localStorage.setItem(INVITE_PENDING_KEY, code);
  else window.localStorage.removeItem(INVITE_PENDING_KEY);
}

/** Read and clear the stashed invite code (used once, on the callback). */
function takePendingInvite(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const code = window.localStorage.getItem(INVITE_PENDING_KEY) ?? undefined;
  window.localStorage.removeItem(INVITE_PENDING_KEY);
  return code || undefined;
}

/** Start Google OAuth. Redirects away; completes on `/auth/callback`. */
export function useGoogleSignIn() {
  return useCallback(async (): Promise<void> => {
    await beginGoogleSignIn();
  }, []);
}

/**
 * Finish sign-in from the OAuth callback: persist the zkLogin session, sign in
 * to the control-plane, and store the CP session. Returns the CP response.
 */
export async function finishSignInFromCallback(idToken: string): Promise<ZkLoginResponse> {
  await completeGoogleSignIn(idToken);
  // The invite code is only needed when creating a new account; returning users
  // won't have one stashed, and the backend ignores it for them.
  const inviteCode = takePendingInvite();
  const res = await cpFetch<ZkLoginResponse>("/v1/auth/zklogin", {
    method: "POST",
    body: inviteCode ? { google_jwt: idToken, invite_code: inviteCode } : { google_jwt: idToken },
    unauthenticated: true,
  });
  cpSessionStore.write({
    token: res.token,
    accountId: res.account.id,
    suiAddress: res.account.sui_address,
    email: res.account.email,
  });
  return res;
}

export function useSignOut() {
  const router = useRouter();
  return useCallback(() => {
    cpSessionStore.clear();
    clearZkSession();
    router.replace("/login");
  }, [router]);
}

export interface CpSessionState {
  /** True after first client mount — gates rendering of auth-conditional UI
   *  so SSR markup and first client paint stay identical. */
  mounted: boolean;
  session: StoredSession | null;
}

export function useCpSession(): CpSessionState {
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    setSession(cpSessionStore.read());
    setMounted(true);

    const onChange = () => setSession(cpSessionStore.read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === cpSessionStore.key) {
        setSession(cpSessionStore.read());
      }
    };
    window.addEventListener(cpSessionStore.event, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(cpSessionStore.event, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { mounted, session };
}

/** Single source for the avatar initial in the sidebar. */
export function avatarInitial(email: string | undefined): string {
  if (!email) return "?";
  return email.trim().charAt(0).toUpperCase() || "?";
}

export type { AccountJson, ProjectJson, StoredSession };
