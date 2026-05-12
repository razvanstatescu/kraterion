/**
 * MIME → plaintext dispatcher.
 *
 * Indexing is opt-in per bucket (`KnowledgeBucketSettings`) but the
 * worker still receives **every** PUT event from the indexer. The
 * dispatcher decides per-object whether to extract text or mark the
 * manifest `skipped`. Decisions are conservative: when in doubt we
 * skip with a clear reason instead of trying clever fallbacks.
 *
 * Supported MIME families (K1 scope per `docs/ai-features-plan.md` §1):
 *   - text/*                      → utf-8 decode
 *   - application/json            → utf-8 (JSON is valid input as-is)
 *   - application/xml             → utf-8
 *   - application/x-yaml          → utf-8
 *   - application/javascript      → utf-8 (code corpus)
 *   - application/x-shellscript   → utf-8
 *   - application/pdf             → unpdf (ESM-native, no native deps)
 *
 * Everything else returns `null` with `skip_reason = "unsupported_mime"`.
 * Adding a new MIME family is a single arm in `dispatchExtractor` plus
 * the extractor itself.
 */

import { extractPdf } from "./pdf.js";
import { extractUtf8 } from "./text.js";

export interface ExtractResult {
  text: string;
  /** Optional richer signal from the extractor (page count, encoding,
   *  fallback indicators). Stored on the manifest for debuggability. */
  metadata?: Record<string, unknown>;
}

export interface SkipResult {
  text: null;
  skip_reason: "unsupported_mime" | "too_large" | "empty" | "decode_error";
  detail?: string;
}

export type ExtractorOutcome = ExtractResult | SkipResult;

/**
 * Per-file size cap *before* embedding. Larger inputs go to skip with
 * a clear reason — preserves user data (the file is still in Walrus)
 * while avoiding runaway OpenAI bills on a single PUT. Tune later from
 * `KnowledgeBucketSettings`.
 */
export const MAX_EXTRACT_BYTES = 50 * 1024 * 1024; // 50 MiB plaintext-equivalent cap

const UTF8_MIME_PREFIXES = [
  "text/",
] as const;

const UTF8_MIME_EXACT = new Set<string>([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
  "application/x-shellscript",
  "application/x-typescript",
]);

/**
 * Pick an extractor for `(contentType, bytes)` and return either the
 * extracted plaintext or a typed skip reason.
 */
export async function dispatchExtractor(args: {
  contentType: string | null | undefined;
  bytes: Uint8Array;
}): Promise<ExtractorOutcome> {
  if (args.bytes.byteLength === 0) {
    return { text: null, skip_reason: "empty" };
  }
  if (args.bytes.byteLength > MAX_EXTRACT_BYTES) {
    return {
      text: null,
      skip_reason: "too_large",
      detail: `${args.bytes.byteLength} bytes > ${MAX_EXTRACT_BYTES}`,
    };
  }

  const mime = (args.contentType ?? "").toLowerCase().split(";", 1)[0]!.trim();

  if (UTF8_MIME_PREFIXES.some((p) => mime.startsWith(p)) || UTF8_MIME_EXACT.has(mime)) {
    return extractUtf8(args.bytes);
  }
  if (mime === "application/pdf") {
    return extractPdf(args.bytes);
  }
  return { text: null, skip_reason: "unsupported_mime", detail: mime || "(missing)" };
}
