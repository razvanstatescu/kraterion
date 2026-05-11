"use client";

/**
 * Sign-in / sign-out / session-read hooks.
 *
 * Flow (`useGoogleSignIn`):
 *   1. Locate the Enoki Google wallet via `useWallets()` + `isGoogleWallet`.
 *   2. `useConnectWallet().mutateAsync({ wallet })` — triggers the Enoki
 *      OAuth popup; resolves once Google has returned and Enoki has
 *      written the session.
 *   3. `getSession(wallet)` — pulls the Google ID token from the wallet's
 *      session (the `enoki:getSession` wallet-standard feature).
 *   4. POST `{ google_jwt }` to control-plane's `/v1/auth/zklogin`.
 *      Enoki on the server independently re-verifies the JWT and returns
 *      the canonical Sui address + our session JWT.
 *   5. Persist `{ token, accountId, suiAddress, email }` in localStorage
 *      via `sessionStorage` helper from `./api`.
 *
 * `useCpSession` reads localStorage with a useEffect-mounted gate so
 * SSR/client first-paint never disagrees. Listens for cross-tab
 * `storage` events so sign-out in one tab kicks the others to /login.
 */

import { useConnectWallet, useDisconnectWallet, useWallets } from "@mysten/dapp-kit";
import { getSession, isGoogleWallet } from "@mysten/enoki";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cpFetch, sessionStorage as cpSessionStore, type AccountJson, type ProjectJson, type StoredSession } from "./api";

interface ZkLoginResponse {
  account: AccountJson;
  project: { id: string; name: string };
  token: string;
  created: boolean;
  /** Returned only on first sign-in. The dashboard shows it once and
   *  drops it from memory — never persists. */
  akia?: string;
  secret?: string;
  api_key_id?: string;
}

export function useGoogleSignIn() {
  const wallets = useWallets();
  const { mutateAsync: connect } = useConnectWallet();

  return useCallback(async (): Promise<ZkLoginResponse> => {
    const googleWallet = wallets.find(isGoogleWallet);
    if (!googleWallet) {
      throw new Error(
        "Enoki Google wallet not registered. Check NEXT_PUBLIC_ENOKI_PUBLIC_KEY and NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local.",
      );
    }

    await connect({ wallet: googleWallet });

    const session = await getSession(googleWallet);
    if (!session?.jwt) {
      throw new Error("Enoki returned no JWT after the OAuth popup. Try again.");
    }

    const res = await cpFetch<ZkLoginResponse>("/v1/auth/zklogin", {
      method: "POST",
      body: { google_jwt: session.jwt },
      unauthenticated: true,
    });

    cpSessionStore.write({
      token: res.token,
      accountId: res.account.id,
      suiAddress: res.account.sui_address,
      email: res.account.email,
    });

    return res;
  }, [wallets, connect]);
}

export function useSignOut() {
  const { mutate: disconnect } = useDisconnectWallet();
  const router = useRouter();
  return useCallback(() => {
    cpSessionStore.clear();
    disconnect();
    router.replace("/login");
  }, [disconnect, router]);
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

    const onStorage = (e: StorageEvent) => {
      if (e.key === cpSessionStore.key) {
        setSession(cpSessionStore.read());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { mounted, session };
}

/** Single source for the avatar initial in the sidebar. */
export function avatarInitial(email: string | undefined): string {
  if (!email) return "?";
  return email.trim().charAt(0).toUpperCase() || "?";
}

export type { AccountJson, ProjectJson, StoredSession };
