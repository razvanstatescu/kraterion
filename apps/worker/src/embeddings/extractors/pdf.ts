import { extractText, getDocumentProxy } from "unpdf";
import type { ExtractorOutcome } from "./index.js";

/**
 * PDF → plaintext via `unpdf`.
 *
 * Why unpdf, not pdf-parse: `pdf-parse` is unmaintained, CJS-first, and
 * its `pdfjs-dist` dependency drags `canvas` (native compile) which
 * breaks in NestJS ESM and serverless runtimes. `unpdf` is UnJS,
 * ESM-native, zero native deps, wraps `pdfjs-dist` cleanly. See
 * `docs/decisions.md` 2026-05-12 entry.
 *
 * We use `mergePages: true` so the embedding pipeline sees one
 * continuous string (the chunker will re-segment via token windows).
 * Page boundaries are preserved as `\n\n\f\n\n` page-feed markers,
 * which `unpdf` inserts by default — that gives the chunker a useful
 * boundary hint without us doing per-page work here.
 *
 * Failure modes that map to skip rather than throw:
 *   - encrypted PDF (no password)
 *   - corrupt header / truncated stream
 *   - text-less PDF (all glyphs are images — we'd need OCR, post-K1)
 */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractorOutcome> {
  try {
    // `getDocumentProxy` accepts the raw byte buffer directly — no
    // file-system round-trip, no copy. We pass through what came off
    // Walrus.
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return {
        text: null,
        skip_reason: "empty",
        detail: `PDF rendered ${totalPages} pages with no extractable text (likely scanned images; OCR is post-K1)`,
      };
    }
    return {
      text,
      metadata: {
        extractor: "unpdf",
        total_pages: totalPages,
      },
    };
  } catch (err) {
    return {
      text: null,
      skip_reason: "decode_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
