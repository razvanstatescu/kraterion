/**
 * Load the active Sui CLI keypair from `~/.sui/sui_config/`. Used by
 * scripts that need to sign on-chain transactions from the deployer
 * wallet (bootstrap, reserve admin operations, etc).
 *
 * Reads:
 *   - `~/.sui/sui_config/client.yaml` for the `active_address`.
 *   - `~/.sui/sui_config/sui.keystore` for the matching private key.
 *
 * Returns an `Ed25519Keypair`. Supports the Bech32 `suiprivkey1...`
 * format (Sui CLI ≥ 1.18) and the legacy base64 secret-key format.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const SUI_CONFIG_DIR = join(homedir(), ".sui", "sui_config");

function readActiveAddress(): string {
  const yaml = readFileSync(join(SUI_CONFIG_DIR, "client.yaml"), "utf8");
  const match = yaml.match(/^active_address:\s*"?(0x[0-9a-fA-F]+)"?/m);
  if (!match || !match[1]) {
    throw new Error(`Could not parse active_address from ${SUI_CONFIG_DIR}/client.yaml`);
  }
  return match[1].toLowerCase();
}

function tryFromBech32(s: string): Ed25519Keypair | null {
  if (!s.startsWith("suiprivkey1")) return null;
  const { secretKey } = decodeSuiPrivateKey(s);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function tryFromBase64(s: string): Ed25519Keypair | null {
  // Legacy keystore format: base64 of [scheme_byte][32-byte secret]
  // Scheme 0x00 = Ed25519. Strip the prefix and load.
  try {
    const buf = Buffer.from(s, "base64");
    if (buf.length !== 33 || buf[0] !== 0x00) return null;
    return Ed25519Keypair.fromSecretKey(buf.subarray(1));
  } catch {
    return null;
  }
}

export function loadActiveDeployerKeypair(): { keypair: Ed25519Keypair; address: string } {
  const wantedAddress = readActiveAddress();
  const keystorePath = join(SUI_CONFIG_DIR, "sui.keystore");
  const entries = JSON.parse(readFileSync(keystorePath, "utf8")) as string[];

  for (const entry of entries) {
    const kp = tryFromBech32(entry) ?? tryFromBase64(entry);
    if (!kp) continue;
    const addr = kp.toSuiAddress().toLowerCase();
    if (addr === wantedAddress) {
      return { keypair: kp, address: addr };
    }
  }

  throw new Error(
    `No keypair in ${keystorePath} matches active_address ${wantedAddress}. ` +
      `Run 'sui client switch --address <alias>' to change active wallet, or 'sui keytool list' to inspect.`,
  );
}
