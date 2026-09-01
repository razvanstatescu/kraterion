"use client";

/**
 * Self-hosted zkLogin ceremony (replaces the Enoki wallet + SDK).
 *
 * We run the standard Sui zkLogin flow ourselves with `@mysten/sui/zklogin`:
 *
 *   Sign-in (redirect flow):
 *     1. make an ephemeral Ed25519 keypair,
 *     2. read the current epoch, set maxEpoch = epoch + N,
 *     3. generate randomness + a `nonce` bound to (ephemeral pubkey, maxEpoch),
 *     4. redirect to Google with that nonce (response_type=id_token),
 *     5. on return, read the id_token, fetch our salt, and sign in to the CP.
 *     The ephemeral secret + maxEpoch + randomness + jwt + salt are persisted
 *     as the "zkLogin session" so we can sign transactions later.
 *
 *   Signing a sponsored tx:
 *     1. sign the prepared tx bytes with the ephemeral key (userSignature),
 *     2. fetch the Groth16 proof from the CP prover proxy,
 *     3. assemble the zkLogin signature (proof + addressSeed + userSignature).
 *
 * No third-party service — the only network calls are Google OAuth (which we
 * would make anyway) and our own control-plane.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import {
  genAddressSeed,
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  getZkLoginSignature,
  jwtToAddress,
} from "@mysten/sui/zklogin";
import { env } from "./env";

/** The ZK proof inputs returned by the prover (everything except addressSeed,
 *  which we derive locally). Cached per session and reused across txs. */
type ZkProofInputs = Omit<
  Parameters<typeof getZkLoginSignature>[0]["inputs"],
  "addressSeed"
>;

const STORAGE_KEY = "kr.zklogin.session";
// How many epochs the zkLogin proof stays valid. Testnet epochs are ~1 day,
// mainnet ~14 days — keep the wall-clock window comparable across networks.
const MAX_EPOCH_AHEAD: Record<string, number> = { testnet: 10, mainnet: 2, devnet: 10 };

interface PendingCeremony {
  ephemeralSecret: string; // suiprivkey… (bech32)
  maxEpoch: number;
  randomness: string;
}
const PENDING_KEY = "kr.zklogin.pending";

export interface ZkLoginSession {
  jwt: string;
  salt: string;
  address: string;
  sub: string;
  aud: string;
  maxEpoch: number;
  randomness: string;
  ephemeralSecret: string;
  /** The ZK proof, generated once and reused for every tx until maxEpoch.
   *  Absent until the first transaction of the session. */
  proof?: ZkProofInputs;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getZkSession(): ZkLoginSession | null {
  return readJson<ZkLoginSession>(STORAGE_KEY);
}

export function clearZkSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(PENDING_KEY);
}

/** Base64url-decode a JWT payload to read `sub`/`aud` (browser-safe). */
function decodeClaims(jwt: string): { sub: string; aud: string } {
  const seg = jwt.split(".")[1]!;
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(b64)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
  const payload = JSON.parse(json) as { sub: string; aud: string | string[] };
  return { sub: payload.sub, aud: Array.isArray(payload.aud) ? payload.aud[0]! : payload.aud };
}

async function currentEpoch(): Promise<number> {
  // Transport-agnostic: read the epoch from the network's GraphQL endpoint.
  const graphql = `https://graphql.${env.network}.sui.io/graphql`;
  const res = await fetch(graphql, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ epoch { epochId } }" }),
  });
  const body = (await res.json()) as { data?: { epoch?: { epochId?: number } } };
  const epoch = body.data?.epoch?.epochId;
  if (typeof epoch !== "number") throw new Error("Could not read current Sui epoch");
  return epoch;
}

/**
 * Step 1 — begin sign-in: build the Google OAuth URL and redirect. Persists
 * the ephemeral key + randomness + maxEpoch so the callback can finish.
 */
export async function beginGoogleSignIn(): Promise<void> {
  const ephemeral = Ed25519Keypair.generate();
  const epoch = await currentEpoch();
  const maxEpoch = epoch + (MAX_EPOCH_AHEAD[env.network] ?? 2);
  const randomness = generateRandomness();
  const nonce = generateNonce(ephemeral.getPublicKey(), maxEpoch, randomness);

  const pending: PendingCeremony = {
    ephemeralSecret: ephemeral.getSecretKey(),
    maxEpoch,
    randomness,
  };
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: env.getGoogleClientId(),
    redirect_uri: `${window.location.origin}/auth/callback`,
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Step 2 — complete sign-in from the OAuth callback. Returns the id_token to
 * hand to the control-plane, after persisting the full zkLogin session.
 */
export async function completeGoogleSignIn(idToken: string): Promise<string> {
  const pending = readJson<PendingCeremony>(PENDING_KEY);
  if (!pending) {
    throw new Error("No pending zkLogin ceremony — start sign-in again.");
  }
  const { sub, aud } = decodeClaims(idToken);

  // Fetch our deterministic salt for this user (verified server-side).
  const saltRes = await fetch(`${env.controlPlaneUrl}/v1/auth/zklogin/salt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jwt: idToken }),
  });
  if (!saltRes.ok) throw new Error(`salt request failed: ${saltRes.status}`);
  const { salt } = (await saltRes.json()) as { salt: string };

  const address = jwtToAddress(idToken, salt, false);

  const session: ZkLoginSession = {
    jwt: idToken,
    salt,
    address,
    sub,
    aud,
    maxEpoch: pending.maxEpoch,
    randomness: pending.randomness,
    ephemeralSecret: pending.ephemeralSecret,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.localStorage.removeItem(PENDING_KEY);
  return idToken;
}

/**
 * Step 3 — sign prepared sponsored-tx bytes with the active zkLogin identity.
 * Returns the assembled zkLogin signature to hand to `/v1/sponsor/execute`.
 */
export async function signWithZkLogin(txBytes: Uint8Array): Promise<string> {
  const { session, ephemeral } = requireEphemeral();
  const { signature: userSignature } = await ephemeral.signTransaction(txBytes);
  return assembleZkLoginSignature(session, ephemeral, userSignature);
}

/**
 * Sign a personal message with the zkLogin identity — used for the Seal
 * SessionKey the browser needs to decrypt private files. Same proof/wrap as
 * a tx; only the inner signature is over the personal message instead of a tx.
 * Shaped like dApp Kit's `signPersonalMessage` (`{ signature }`) so it drops
 * straight into the Seal helpers.
 */
export async function signPersonalMessageWithZkLogin(
  message: Uint8Array,
): Promise<{ signature: string }> {
  const { session, ephemeral } = requireEphemeral();
  const { signature: userSignature } = await ephemeral.signPersonalMessage(message);
  return { signature: await assembleZkLoginSignature(session, ephemeral, userSignature) };
}

function requireEphemeral(): { session: ZkLoginSession; ephemeral: Ed25519Keypair } {
  const session = getZkSession();
  if (!session) throw new Error("Not signed in with zkLogin.");
  const ephemeral = Ed25519Keypair.fromSecretKey(
    decodeSuiPrivateKey(session.ephemeralSecret).secretKey,
  );
  return { session, ephemeral };
}

/**
 * Wrap an ephemeral-key `userSignature` (over a tx or a personal message) into
 * a full zkLogin signature. The proof is independent of what's being signed —
 * it proves the ephemeral key ↔ Google identity binding — so it's generated
 * once per login and reused (`ensureProof`), keeping the prover to ~one call
 * per user per several days.
 */
async function assembleZkLoginSignature(
  session: ZkLoginSession,
  ephemeral: Ed25519Keypair,
  userSignature: string,
): Promise<string> {
  const proof = await ensureProof(session, ephemeral);
  const addressSeed = genAddressSeed(
    BigInt(session.salt),
    "sub",
    session.sub,
    session.aud,
  ).toString();
  return getZkLoginSignature({
    inputs: { ...proof, addressSeed },
    maxEpoch: session.maxEpoch,
    userSignature,
  });
}

/** Return the session's cached proof, generating + persisting it on first use. */
async function ensureProof(
  session: ZkLoginSession,
  ephemeral: Ed25519Keypair,
): Promise<ZkProofInputs> {
  if (session.proof) return session.proof;

  const proveRes = await fetch(`${env.controlPlaneUrl}/v1/auth/zklogin/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt: session.jwt,
      extendedEphemeralPublicKey: getExtendedEphemeralPublicKey(ephemeral.getPublicKey()),
      maxEpoch: session.maxEpoch,
      jwtRandomness: session.randomness,
      salt: session.salt,
      keyClaimName: "sub",
    }),
  });
  if (!proveRes.ok) {
    throw new Error(`prover request failed: ${proveRes.status} ${await proveRes.text()}`);
  }
  const proof = (await proveRes.json()) as ZkProofInputs;

  // Persist so later txs in this session skip the prover entirely.
  const current = getZkSession();
  if (current) {
    current.proof = proof;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }
  return proof;
}
