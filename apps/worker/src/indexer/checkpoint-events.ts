/**
 * Walk a single `Checkpoint` proto message and yield the events
 * matching our package, plus per-tx effects context the handlers
 * need.
 *
 * The proto fields look like:
 *   checkpoint
 *     .sequenceNumber : bigint
 *     .summary.timestamp : Timestamp { seconds: bigint, nanos: number }
 *     .transactions[]
 *       .digest : string ("0x...")
 *       .events.events[]
 *         .packageId : string ("0x...")
 *         .module : string
 *         .eventType : string ("0x...::module::Struct")
 *         .sender : string
 *         .json : google.protobuf.Value (pre-deserialized)
 *       .effects.changedObjects[]
 *         .objectId : string
 *         .objectType : string
 *         .idOperation : "Created" | "Mutated" | ...
 *
 * We filter events client-side by `event.packageId === KRATERION_PACKAGE_ID`
 * (Sui's gRPC has no server-side filter — see read-mask.ts). The
 * `event_seq` reconstruction is the array index `j` in
 * `events.events[j]` — there is no native `eventSeq` field in the proto.
 */

import { KRATERION_PACKAGE_ID } from "@kraterion/shared";
import type { ParsedEvent } from "./handlers/handler.interface.js";

/**
 * Convert a `google.protobuf.Value` (protobuf-ts shape) to a plain JSON
 * value. The Mysten SDK uses an internal `Value.toJson(...)` from
 * `@mysten/sui/dist/grpc/proto/google/protobuf/struct.mjs` (not a
 * public subpath), so we replicate the small conversion here.
 *
 * Shape per `google.protobuf.Value`:
 *   kind: { oneofKind: 'nullValue' | 'numberValue' | 'stringValue'
 *                       | 'boolValue' | 'structValue' | 'listValue', … }
 */
type ProtoValue = { kind: { oneofKind: string; [k: string]: unknown } };

function valueToJson(v: ProtoValue | undefined): unknown {
  if (!v?.kind) return null;
  const k = v.kind;
  switch (k.oneofKind) {
    case "nullValue":
      return null;
    case "numberValue":
      return k["numberValue"];
    case "stringValue":
      return k["stringValue"];
    case "boolValue":
      return k["boolValue"];
    case "structValue": {
      const fields = (k["structValue"] as { fields?: Record<string, ProtoValue> } | undefined)?.fields ?? {};
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        out[key] = valueToJson(value);
      }
      return out;
    }
    case "listValue": {
      const values = (k["listValue"] as { values?: ProtoValue[] } | undefined)?.values ?? [];
      return values.map((v2) => valueToJson(v2));
    }
    default:
      return null;
  }
}

// We type the inputs as `unknown` and narrow defensively because the
// generated proto types live deep in `@mysten/sui/grpc/proto/...` and
// are awkward to import directly. The shape we depend on is small and
// well-defined; defensive narrowing isolates us from internal SDK
// reshuffles.

interface ProtoTimestamp {
  seconds?: bigint;
  nanos?: number;
}
interface ProtoEvent {
  packageId?: string;
  module?: string;
  eventType?: string;
  sender?: string;
  json?: ProtoValue;
}
interface ProtoChangedObject {
  objectId?: string;
  objectType?: string;
  idOperation?: number | string;
}
interface ProtoTransaction {
  digest?: string;
  events?: { events?: ProtoEvent[] };
  effects?: { changedObjects?: ProtoChangedObject[] };
}
interface ProtoCheckpoint {
  sequenceNumber?: bigint;
  digest?: string;
  summary?: { timestamp?: ProtoTimestamp };
  transactions?: ProtoTransaction[];
}

export interface KraterionEventBatch {
  /** All events in this checkpoint matching our package, in tx order. */
  events: ParsedEvent[];
  /** Last tx digest we touched in the checkpoint (for cursor diagnostic). */
  lastTxDigest: Buffer | null;
  /** Last event_seq we touched in the checkpoint. */
  lastEventSeq: number | null;
}

export function walkCheckpoint(
  checkpoint: ProtoCheckpoint,
  packageId: string = KRATERION_PACKAGE_ID,
): KraterionEventBatch {
  const checkpointSeq = checkpoint.sequenceNumber ?? 0n;
  const timestampMs = computeTimestampMs(checkpoint.summary?.timestamp);

  const events: ParsedEvent[] = [];
  let lastTxDigest: Buffer | null = null;
  let lastEventSeq: number | null = null;

  for (const tx of checkpoint.transactions ?? []) {
    const digest = tx.digest;
    if (!digest) continue;

    // We only build txDigest as a Buffer once, and only if we find a
    // matching event in this tx — saves work on the 99%-of-checkpoints
    // case where our package isn't involved.
    let txDigestBuf: Buffer | null = null;
    const changedObjects = (tx.effects?.changedObjects ?? []).map(toChangedObject);

    const evs = tx.events?.events ?? [];
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]!;
      if (ev.packageId !== packageId) continue;

      if (!txDigestBuf) txDigestBuf = digestToBuffer(digest);

      const payload = ev.json
        ? ((valueToJson(ev.json) ?? {}) as Record<string, unknown>)
        : {};
      events.push({
        eventType: ev.eventType ?? "",
        module: ev.module ?? "",
        sender: ev.sender ?? "",
        txDigest: txDigestBuf,
        eventSeq: i,
        checkpointSeq,
        timestampMs,
        payload,
        txEffects: { changedObjects },
      });
      lastTxDigest = txDigestBuf;
      lastEventSeq = i;
    }
  }

  return { events, lastTxDigest, lastEventSeq };
}

function computeTimestampMs(t: ProtoTimestamp | undefined): number {
  if (!t) return 0;
  const seconds = typeof t.seconds === "bigint" ? t.seconds : BigInt(t.seconds ?? 0);
  const nanos = t.nanos ?? 0;
  return Number(seconds) * 1000 + Math.floor(nanos / 1_000_000);
}

function digestToBuffer(digest: string): Buffer {
  // Sui tx digests in gRPC come as base58? Actually as base64 strings or
  // canonical "0x..." hex depending on field type. The proto has the
  // digest as a base58 string for txs. We keep it as a UTF-8 string in
  // a Buffer; downstream lookup is exact-match so the encoding doesn't
  // matter as long as it's stable.
  return Buffer.from(digest, "utf8");
}

function toChangedObject(co: ProtoChangedObject): {
  objectId: string;
  objectType: string;
  idOperation: "created" | "deleted" | "unknown";
} {
  return {
    objectId: co.objectId ?? "",
    objectType: co.objectType ?? "",
    idOperation: normalizeIdOperation(co.idOperation),
  };
}

function normalizeIdOperation(
  raw: number | string | undefined,
): "created" | "deleted" | "unknown" {
  // The proto enum is `ChangedObject.IdOperation`:
  //   ID_OPERATION_UNKNOWN = 0
  //   NONE                 = 1
  //   CREATED              = 2
  //   DELETED              = 3
  // (There is NO `MUTATED` in this enum — mutated objects have
  // id_operation = NONE; "mutated" lives in `output_object_state`.)
  // The wire form is either the integer or the canonical name string.
  if (raw === 2) return "created";
  if (raw === 3) return "deleted";
  if (typeof raw === "string") {
    const s = raw.toUpperCase();
    if (s === "CREATED") return "created";
    if (s === "DELETED") return "deleted";
  }
  return "unknown";
}
