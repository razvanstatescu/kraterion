/**
 * Offline unit probe for the self-hosted zkLogin server pieces (no Enoki, no
 * Google, no network). Validates the crypto and derivation logic that
 * replaces Enoki's `getZkLogin`:
 *
 *   - GoogleJwtService verifies a genuine RS256 signature + iss/aud/exp, and
 *     rejects tampered / wrong-audience / expired tokens.
 *   - ZkLoginSaltService derives a stable, per-user salt.
 *   - jwtToAddress derives a deterministic Sui address from (jwt, salt).
 *
 * We stand up a throwaway RSA keypair, sign a Google-shaped JWT with it, and
 * monkeypatch `fetch` so the verifier's JWKS lookup returns our public key.
 *
 * Run: `pnpm -F @kraterion/control-plane zklogin:probe`
 */

import { createSign, generateKeyPairSync, type JsonWebKey } from "node:crypto";

// Configure env BEFORE importing the services (salt service reads it in ctor).
const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env["GOOGLE_CLIENT_ID"] = CLIENT_ID;
process.env["ZKLOGIN_SALT_SEED"] =
  "1111111111111111111111111111111111111111111111111111111111111111";

const { GoogleJwtService } = await import("../src/enoki/google-jwt.service.js");
const { ZkLoginSaltService } = await import("../src/enoki/salt.service.js");
const { jwtToAddress } = await import("@mysten/sui/zklogin");

function ok(s: string) { console.log(`\x1b[32m  ✓\x1b[0m ${s}`); }
function fail(s: string): never { console.error(`\x1b[31m  ✗ ${s}\x1b[0m`); process.exit(1); }
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

// --- throwaway RSA key + JWKS ---
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid-1";
const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
const jwks = { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };

function makeJwt(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const sig = b64url(signer.sign(privateKey));
  return `${header}.${payload}.${sig}`;
}

// --- monkeypatch fetch to serve our JWKS ---
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request) => {
  const u = typeof url === "string" ? url : url.toString();
  if (u.includes("googleapis.com/oauth2/v3/certs")) {
    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(url as never);
}) as typeof fetch;

async function main() {
  console.log("\x1b[1m=== zkLogin self-host server probe ===\x1b[0m");
  const google = new GoogleJwtService();
  const salt = new ZkLoginSaltService();

  const now = Math.floor(Date.now() / 1000);
  const baseClaims = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "104839273847willkcommen",
    email: "builder@example.com",
    email_verified: true,
    exp: now + 3600,
    iat: now,
  };

  // 1. valid token verifies
  const jwt = makeJwt(baseClaims);
  const claims = await google.verify(jwt);
  if (claims.sub !== baseClaims.sub || claims.email !== baseClaims.email) {
    fail(`verified claims mismatch: ${JSON.stringify(claims)}`);
  }
  ok(`valid RS256 token verified (sub=${claims.sub})`);

  // 2. tampered signature rejected
  try {
    await google.verify(jwt.slice(0, -4) + "AAAA");
    fail("tampered token should have been rejected");
  } catch {
    ok("tampered signature rejected");
  }

  // 3. wrong audience rejected
  try {
    await google.verify(makeJwt({ ...baseClaims, aud: "someone-else" }));
    fail("wrong-audience token should have been rejected");
  } catch {
    ok("wrong audience rejected");
  }

  // 4. expired token rejected
  try {
    await google.verify(makeJwt({ ...baseClaims, exp: now - 10 }));
    fail("expired token should have been rejected");
  } catch {
    ok("expired token rejected");
  }

  // 5. salt determinism + uniqueness
  const s1 = salt.deriveSalt(claims.iss, claims.aud, claims.sub);
  const s2 = salt.deriveSalt(claims.iss, claims.aud, claims.sub);
  if (s1 !== s2) fail("salt not deterministic");
  const sOther = salt.deriveSalt(claims.iss, claims.aud, "different-sub");
  if (s1 === sOther) fail("salt collision across different sub");
  if (BigInt(s1) >= 1n << 128n) fail("salt exceeds 128 bits");
  ok(`salt deterministic + unique (salt=${s1.slice(0, 12)}…, <2^128)`);

  // 6. address derivation deterministic + valid
  const addr1 = jwtToAddress(jwt, s1, false);
  const addr2 = jwtToAddress(jwt, s1, false);
  if (addr1 !== addr2) fail("address not deterministic");
  if (!/^0x[0-9a-f]{64}$/.test(addr1)) fail(`address not a valid Sui address: ${addr1}`);
  ok(`address derivation deterministic + valid`);
  console.log(`    address: ${addr1}`);

  // 7. server/client parity: the exact call the dashboard makes yields the
  //    same address the server stores (same salt, same jwt).
  const clientAddr = jwtToAddress(jwt, salt.deriveSalt(claims.iss, claims.aud, claims.sub), false);
  if (clientAddr !== addr1) fail("server/client address parity broken");
  ok("server/client address parity holds");

  console.log("\x1b[1m\n=== zkLogin self-host probe green ===\x1b[0m");
}

main().catch((e) => { console.error(e); process.exit(1); });
