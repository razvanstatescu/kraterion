/**
 * Thin worker-side re-export of `@kraterion/embeddings-client`. The
 * client is shared with the control plane (K2 retrieval) so query
 * embedding and chunk embedding stay model-aligned by construction.
 *
 * See `packages/embeddings-client/src/index.ts` for the actual impl
 * (model defaults, batch size, retry semantics).
 */

export {
  DEFAULT_BATCH_SIZE,
  DEFAULT_DIMENSIONS,
  DEFAULT_MODEL,
  embedAll,
  embedBatch,
  embedQuery,
  type EmbeddingRequest,
  type EmbeddingResult,
} from "@kraterion/embeddings-client";
