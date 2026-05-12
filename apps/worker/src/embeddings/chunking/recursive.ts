/**
 * Recursive character chunker, token-budgeted via the OpenAI tokenizer.
 *
 * Algorithm (LangChain-style, tightened for our scope):
 *
 *   1. Try to split on the highest-level separator (paragraph breaks).
 *   2. If a resulting piece exceeds `chunk_tokens`, recurse with the
 *      next separator (line breaks → sentence ends → words → chars).
 *   3. Greedily pack pieces into windows of ≤ `chunk_tokens`, sliding
 *      with `chunk_overlap_tokens` worth of trailing text between
 *      adjacent windows.
 *
 * Why recursive over fixed-token windows: respects natural document
 * structure (paragraphs, sentences) so chunk boundaries don't sever
 * meaning. Late chunking + contextual retrieval research (2026) says
 * those are higher-recall but ~2× cost / latency; not worth it for
 * bucket-scale RAG. See `docs/decisions.md` 2026-05-12 RAG audit.
 *
 * Tokenizer: `tiktoken` (WASM), `cl100k_base` — the encoding
 * `text-embedding-3-small` uses. Loaded once, freed on `dispose()`.
 */

import { type Tiktoken, get_encoding } from "tiktoken";

export interface RecursiveChunkOptions {
  /** Target window size in tokens. Defaults to per-bucket setting (400). */
  chunk_tokens: number;
  /** Trailing-text overlap, in tokens, between adjacent windows. Default 60. */
  chunk_overlap_tokens: number;
}

export interface Chunk {
  /** Zero-indexed position within the source document. */
  ordinal: number;
  /** Plain-text content for this window. */
  content: string;
  /** Number of tokens this content takes under `cl100k_base`. */
  token_count: number;
  /** UTF-16 code-unit offset into the source string (`String#substring`-compatible). */
  start_offset: number;
  end_offset: number;
}

/** Separator hierarchy. Higher priority = stronger semantic boundary. */
const SEPARATORS: readonly string[] = [
  "\n\n", // paragraph
  "\n", // line
  ". ", // sentence (very rough; good enough for English)
  "? ",
  "! ",
  "; ",
  ", ",
  " ", // word
  "", // codepoint (only when a single token is itself too large)
];

/**
 * One-shot encoder so the WASM allocation is paid once per worker
 * process, not per job. `tiktoken.encode` is pure — safe to share
 * across BullMQ jobs running concurrently.
 */
let _encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!_encoder) _encoder = get_encoding("cl100k_base");
  return _encoder;
}

/** Released by the worker on graceful shutdown — see `embeddings.module.ts`. */
export function disposeEncoder(): void {
  _encoder?.free();
  _encoder = null;
}

/**
 * Split `text` into token-bounded chunks. Deterministic — given the
 * same input + options the manifest hash list is reproducible (the K5
 * verifiability hook depends on this).
 */
export function chunkText(text: string, opts: RecursiveChunkOptions): Chunk[] {
  if (!text || text.trim().length === 0) return [];

  const encoder = getEncoder();
  const tokens = encoder.encode(text);
  if (tokens.length <= opts.chunk_tokens) {
    return [
      {
        ordinal: 0,
        content: text,
        token_count: tokens.length,
        start_offset: 0,
        end_offset: text.length,
      },
    ];
  }

  // 1. Recursive split into atomic pieces (each ≤ chunk_tokens worth).
  const pieces = splitRecursively(text, opts.chunk_tokens, SEPARATORS, 0, encoder);

  // 2. Greedy pack into windows, then add sliding overlap from the
  //    preceding window's tail.
  return packAndOverlap(pieces, opts, encoder);
}

interface Piece {
  text: string;
  token_count: number;
  /** Byte offset into the original document. */
  start_offset: number;
  end_offset: number;
}

function splitRecursively(
  text: string,
  budget: number,
  separators: readonly string[],
  baseOffset: number,
  encoder: Tiktoken,
): Piece[] {
  const tokens = encoder.encode(text);
  if (tokens.length <= budget) {
    return [
      {
        text,
        token_count: tokens.length,
        start_offset: baseOffset,
        end_offset: baseOffset + text.length,
      },
    ];
  }
  if (separators.length === 0) {
    // Last resort: hard-cut on token boundary. This loses character
    // alignment for the cut point but only triggers when even a single
    // word is wider than the budget — rare in practice for natural
    // language; common for minified code, which is fine to slice.
    return hardCutByTokens(text, budget, baseOffset, encoder);
  }

  const sep = separators[0]!;
  const rest = separators.slice(1);
  const segments = splitKeepingOffsets(text, sep);
  const out: Piece[] = [];
  let cursor = baseOffset;
  for (const seg of segments) {
    const segText = seg.text;
    const segTokens = encoder.encode(segText);
    if (segTokens.length <= budget) {
      out.push({
        text: segText,
        token_count: segTokens.length,
        start_offset: cursor,
        end_offset: cursor + segText.length,
      });
    } else {
      // Recurse with the next-finer separator.
      out.push(...splitRecursively(segText, budget, rest, cursor, encoder));
    }
    cursor += segText.length;
  }
  return out;
}

/**
 * `String#split` but keeps offsets straight and includes the separator
 * with the preceding segment (so the original text round-trips).
 */
function splitKeepingOffsets(text: string, separator: string): { text: string }[] {
  if (!separator) {
    // Codepoint-level fallback — return single chars.
    return Array.from(text).map((c) => ({ text: c }));
  }
  const out: { text: string }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(separator, i);
    if (idx === -1) {
      out.push({ text: text.slice(i) });
      break;
    }
    out.push({ text: text.slice(i, idx + separator.length) });
    i = idx + separator.length;
  }
  return out;
}

function hardCutByTokens(
  text: string,
  budget: number,
  baseOffset: number,
  encoder: Tiktoken,
): Piece[] {
  // Walk the string and emit chunks at token-budget boundaries. We
  // re-encode a sliding prefix to find the split point, which is
  // O(n²) in the worst case but only ever applied to oversized
  // single tokens (rare).
  const out: Piece[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let lo = cursor + 1;
    let hi = text.length;
    let best = lo;
    // Binary search the longest prefix that fits the budget.
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const slice = text.slice(cursor, mid);
      const tokens = encoder.encode(slice);
      if (tokens.length <= budget) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const sliceText = text.slice(cursor, best);
    out.push({
      text: sliceText,
      token_count: encoder.encode(sliceText).length,
      start_offset: baseOffset + cursor,
      end_offset: baseOffset + best,
    });
    cursor = best;
  }
  return out;
}

function packAndOverlap(
  pieces: readonly Piece[],
  opts: RecursiveChunkOptions,
  encoder: Tiktoken,
): Chunk[] {
  const chunks: Chunk[] = [];
  let buf: Piece[] = [];
  let bufTokens = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const first = buf[0]!;
    const last = buf[buf.length - 1]!;
    const content = buf.map((p) => p.text).join("");
    chunks.push({
      ordinal: chunks.length,
      content,
      token_count: bufTokens,
      start_offset: first.start_offset,
      end_offset: last.end_offset,
    });
    // Carry the trailing `chunk_overlap_tokens` worth of content into
    // the next window so the model sees adjacent context.
    const overlap = takeTrailingTokens(buf, opts.chunk_overlap_tokens, encoder);
    buf = overlap;
    bufTokens = overlap.reduce((s, p) => s + p.token_count, 0);
  };

  for (const piece of pieces) {
    if (bufTokens + piece.token_count > opts.chunk_tokens && buf.length > 0) {
      flush();
    }
    buf.push(piece);
    bufTokens += piece.token_count;
  }
  flush();

  return chunks;
}

/**
 * Take the trailing `target` tokens worth of pieces from `buf`. If a
 * single piece is wider than `target`, slice it on a token boundary —
 * we lose codepoint alignment for the overlap (which doesn't matter,
 * overlap is for embedding context only; manifest offsets reference
 * the canonical windows).
 */
function takeTrailingTokens(
  buf: readonly Piece[],
  target: number,
  encoder: Tiktoken,
): Piece[] {
  if (target <= 0) return [];
  const taken: Piece[] = [];
  let remaining = target;
  for (let i = buf.length - 1; i >= 0 && remaining > 0; i--) {
    const p = buf[i]!;
    if (p.token_count <= remaining) {
      taken.unshift(p);
      remaining -= p.token_count;
    } else {
      // Slice the piece from its tail to grab the remaining token
      // budget. Approximate by reverse character-walk + token recount.
      const sliced = sliceTrailingTokens(p, remaining, encoder);
      if (sliced) taken.unshift(sliced);
      remaining = 0;
    }
  }
  return taken;
}

function sliceTrailingTokens(p: Piece, target: number, encoder: Tiktoken): Piece | null {
  if (target <= 0) return null;
  // Walk back through the string until token count from cut → end ≤ target.
  let cut = p.text.length;
  // Roughly 4 chars per token, with safety. Adjust if it overshoots.
  let step = Math.max(1, Math.floor(target * 4));
  while (cut > 0) {
    const next = Math.max(0, cut - step);
    const slice = p.text.slice(next);
    const tokens = encoder.encode(slice).length;
    if (tokens > target) {
      // Overshot; binary-search forward.
      let lo = next;
      let hi = cut;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const midSlice = p.text.slice(mid);
        if (encoder.encode(midSlice).length <= target) {
          hi = mid;
        } else {
          lo = mid + 1;
        }
      }
      const finalSlice = p.text.slice(lo);
      return {
        text: finalSlice,
        token_count: encoder.encode(finalSlice).length,
        start_offset: p.start_offset + lo,
        end_offset: p.end_offset,
      };
    }
    cut = next;
    step *= 2;
  }
  return {
    text: p.text,
    token_count: p.token_count,
    start_offset: p.start_offset,
    end_offset: p.end_offset,
  };
}
