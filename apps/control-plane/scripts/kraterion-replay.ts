#!/usr/bin/env tsx
/**
 * `pnpm replay 0x<txDigest>` — the demo CLI for D8.
 *
 * Hits `GET /v1/runs/:txDigest/replay` against the running control
 * plane, validates the on-chain trace hash, and pretty-prints the
 * session trace.
 *
 * Env:
 *   KRATERION_API_URL   default http://localhost:4001
 *   KRATERION_BEARER    a bearer token (kr_test_... or kr_live_...).
 *                       For demo flow, mint via the dashboard's API
 *                       Keys page or `/v1/api-keys` endpoint.
 *
 * Usage:
 *   pnpm replay 0xabc123...
 *   KRATERION_BEARER=kr_test_xyz pnpm replay 0xabc123...
 *
 * Exit codes:
 *   0  trace fetched + hash matches
 *   1  missing args / configuration
 *   2  HTTP error from the control plane
 *   3  hash mismatch (tamper signal — the loud one)
 */

import "dotenv/config";

interface DiffLine {
  kind: "equal" | "captured" | "replay";
  text: string;
}
interface ReplayTurn {
  ordinal: number;
  invocation_id: string;
  captured_output: string;
  captured_system_fingerprint: string | null;
  replay_output: string;
  replay_system_fingerprint: string | null;
  system_fingerprint_matched: boolean;
  tool_calls_replayed: string[];
  diff: { differs: boolean; lines: DiffLine[] };
}
interface ReplayResult {
  turns: ReplayTurn[];
  any_output_differs: boolean;
  any_fingerprint_mismatch: boolean;
}
interface ReplayResponse {
  tx_digest: string;
  session_id: string;
  agent_id: string;
  project_id: string;
  invocation_count: number;
  anchored_at: string;
  walrus_blob_id: string;
  trace_hash_hex: string;
  trace_hash_matches: boolean;
  trace: Record<string, unknown>;
  replay?: ReplayResult;
}

const COLOR = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function color(c: keyof typeof COLOR, s: string): string {
  return process.stdout.isTTY ? `${COLOR[c]}${s}${COLOR.reset}` : s;
}

async function main(): Promise<number> {
  // pnpm's filter+forward injects a literal `--` separator into argv;
  // skip it.
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const rerun = argv.includes("--rerun");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const digest = positional[0];
  // Sui transaction digests are base58 (~43-44 chars, base58btc alphabet).
  // We also accept the hex form (with or without `0x`) for callers that
  // copy from Postgres directly.
  const looksLikeBase58 = digest ? /^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(digest) : false;
  const looksLikeHex = digest ? /^(?:0x)?[0-9a-fA-F]{64}$/.test(digest) : false;
  if (!digest || (!looksLikeBase58 && !looksLikeHex)) {
    console.error("usage: pnpm replay <txDigest>");
    console.error("   or: tsx scripts/kraterion-replay.ts <txDigest>");
    if (digest) {
      console.error(`(received ${JSON.stringify(digest)} — expected a Sui base58 digest like "HNtDY2ek5bb…" or 64-char hex)`);
    }
    return 1;
  }

  const apiUrl = process.env["KRATERION_API_URL"] ?? "http://localhost:4001";
  const bearer = process.env["KRATERION_BEARER"];
  if (!bearer) {
    console.error("error: KRATERION_BEARER env var required (a kr_test_… or kr_live_… token)");
    return 1;
  }

  const url = `${apiUrl}/v1/runs/${encodeURIComponent(digest)}/replay${rerun ? "?rerun=true" : ""}`;
  console.log(color("dim", `▸ GET ${url}`));
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
  } catch (err) {
    console.error(
      color("red", `error: could not reach control plane: ${(err as Error).message}`),
    );
    return 2;
  }
  const elapsed = Date.now() - t0;

  const body = await res.text();
  if (!res.ok) {
    console.error(color("red", `◀ ${res.status} ${res.statusText} (${elapsed}ms)`));
    try {
      const json = JSON.parse(body);
      console.error(color("red", JSON.stringify(json, null, 2)));
    } catch {
      console.error(body);
    }
    return 2;
  }

  let data: ReplayResponse;
  try {
    data = JSON.parse(body) as ReplayResponse;
  } catch (err) {
    console.error(color("red", `error: invalid JSON response: ${(err as Error).message}`));
    return 2;
  }
  console.log(color("dim", `◀ ${res.status} ${res.statusText} (${elapsed}ms)`));

  printHeader(data);
  printTraceSummary(data);
  printFirstTurn(data);
  if (data.replay) printReplayDiff(data.replay);

  if (!data.trace_hash_matches) {
    console.log();
    console.log(
      color(
        "red",
        `✗ TRACE HASH MISMATCH — chain says ${data.trace_hash_hex.slice(0, 16)}… ` +
          `but the decrypted bytes hash differently. This is a tamper signal.`,
      ),
    );
    return 3;
  }
  console.log();
  console.log(color("green", `✓ trace_hash matches the on-chain commitment`));
  console.log(
    color(
      "dim",
      `  trace_hash = ${data.trace_hash_hex}`,
    ),
  );
  return 0;
}

function printHeader(d: ReplayResponse): void {
  console.log();
  console.log(color("bold", "Replayable Agent Run"));
  console.log(color("dim", "─".repeat(60)));
  console.log(`  tx_digest        ${color("cyan", d.tx_digest)}`);
  console.log(`  session_id       ${d.session_id}`);
  console.log(`  agent_id         ${d.agent_id}`);
  console.log(`  project_id       ${d.project_id}`);
  console.log(`  anchored_at      ${d.anchored_at}`);
  console.log(`  walrus_blob_id   ${color("magenta", d.walrus_blob_id)}`);
  console.log(`  invocations      ${color("bold", String(d.invocation_count))}`);
}

function printTraceSummary(d: ReplayResponse): void {
  const t = d.trace as Record<string, unknown>;
  console.log();
  console.log(color("bold", "Session metadata"));
  console.log(color("dim", "─".repeat(60)));
  console.log(`  opened_at        ${t["opened_at"]}`);
  console.log(`  closed_at        ${t["closed_at"]}`);
  console.log(`  close_reason     ${t["close_reason"]}`);
  const principal = t["principal"] as Record<string, unknown> | undefined;
  if (principal) {
    console.log(
      `  principal        ${principal["kind"]} (id_hash ${String(principal["id_hash"]).slice(0, 16)}…)`,
    );
  }
  const agent = t["agent"] as Record<string, unknown> | undefined;
  if (agent) {
    console.log(`  agent.sub_wallet ${agent["sub_wallet_address"]}`);
  }
  const md = t["model_defaults"] as Record<string, unknown> | undefined;
  if (md) {
    console.log(
      `  model_defaults   ${md["requested"]} ` +
        `(temp=${md["temperature"]}, max_tokens=${md["max_tokens"]})`,
    );
  }
}

function printFirstTurn(d: ReplayResponse): void {
  const invocations = (d.trace as Record<string, unknown>)["invocations"];
  if (!Array.isArray(invocations) || invocations.length === 0) return;
  const first = invocations[0] as Record<string, unknown>;
  console.log();
  console.log(color("bold", `First turn (${invocations.length} total)`));
  console.log(color("dim", "─".repeat(60)));
  const inputObj = first["input"] as Record<string, unknown> | undefined;
  const lastUser = inputObj?.["last_user_message"];
  if (typeof lastUser === "string") {
    console.log(`  user             ${truncate(lastUser, 200)}`);
  }
  const output = first["output"] as Record<string, unknown> | undefined;
  if (typeof output?.["text"] === "string") {
    console.log(`  assistant        ${truncate(output["text"] as string, 200)}`);
  }
  const retrieval = first["retrieval"] as Record<string, unknown> | undefined;
  if (retrieval) {
    const hits = (retrieval["hits"] as Array<unknown> | undefined) ?? [];
    console.log(`  retrieval hits   ${hits.length}`);
  }
  const toolCalls = first["tool_calls"] as Array<unknown> | undefined;
  if (toolCalls && toolCalls.length > 0) {
    console.log(`  tool_calls       ${toolCalls.length}`);
  }
  if (invocations.length > 1) {
    console.log(
      color(
        "dim",
        `  (+${invocations.length - 1} more turn(s) — see the full JSON in the trace field)`,
      ),
    );
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function printReplayDiff(r: ReplayResult): void {
  console.log();
  console.log(color("bold", "Replay (re-issued against the same model + seed)"));
  console.log(color("dim", "─".repeat(60)));
  for (const turn of r.turns) {
    console.log(
      `  turn ${turn.ordinal}  fingerprint ${
        turn.system_fingerprint_matched
          ? color("green", "✓ matched")
          : color("yellow", "✗ drifted")
      }   ${
        turn.diff.differs
          ? color("yellow", "outputs differ")
          : color("green", "outputs identical")
      }`,
    );
    if (turn.tool_calls_replayed.length > 0) {
      console.log(
        color(
          "dim",
          `    short-circuited tool_calls: ${turn.tool_calls_replayed.join(", ")}`,
        ),
      );
    }
    if (turn.diff.differs) {
      for (const line of turn.diff.lines) {
        const prefix =
          line.kind === "equal"
            ? "    "
            : line.kind === "captured"
              ? color("red", "  - ")
              : color("green", "  + ");
        console.log(prefix + truncate(line.text, 240));
      }
    }
    console.log();
  }
  console.log(
    `  summary: ${
      r.any_output_differs
        ? color("yellow", "some turns drifted")
        : color("green", "all turns matched verbatim")
    } / ${
      r.any_fingerprint_mismatch
        ? color("yellow", "fingerprint drift detected")
        : color("green", "fingerprint stable")
    }`,
  );
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(color("red", `fatal: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
