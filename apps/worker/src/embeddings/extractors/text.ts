import type { ExtractorOutcome } from "./index.js";

/**
 * UTF-8 plaintext extractor. Handles `text/*`, `application/json`,
 * `application/xml`, source-code MIME types — anything we can decode
 * as UTF-8 without further parsing.
 *
 * Why we don't normalize / strip / lowercase here: chunking + embedding
 * downstream care about the original byte offsets so manifest hashes
 * round-trip. Normalization (BOM strip, line-ending fold, etc.) is the
 * chunker's call, not the extractor's.
 */
export function extractUtf8(bytes: Uint8Array): ExtractorOutcome {
  try {
    // `fatal: true` so invalid UTF-8 surfaces as a skip, not silent
    // mojibake. Most "binary masquerading as text/plain" content trips
    // this — the user paid storage for it, we just won't embed it.
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const text = decoder.decode(bytes);
    if (text.trim().length === 0) {
      return { text: null, skip_reason: "empty" };
    }
    return { text };
  } catch (err) {
    return {
      text: null,
      skip_reason: "decode_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
