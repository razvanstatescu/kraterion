import { z } from "zod";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { jsonText, type ToolDef } from "./types.js";

const TOP_K_MIN = 1;
const TOP_K_MAX = 10;
const TOP_K_DEFAULT = 5;

const schema = z.object({
  query: z.string().min(1).max(4096),
  top_k: z.number().int().min(TOP_K_MIN).max(TOP_K_MAX).optional(),
});

/**
 * P9 Feature 3 — `memory.recall` agent tool.
 *
 * Returns up to top_k memories from this agent's namespace ranked by
 * semantic distance (lower distance = better match). The handler
 * returns a compact JSON payload — the model reads the `text` of each
 * hit; operators see `distance` and `blob_id` in the audit trail for
 * provenance.
 */
export const memoryRecallTool: ToolDef<typeof schema> = {
  name: "memory_recall",
  label: "Recall",
  description:
    "Retrieve memories relevant to a semantic query from this agent's " +
    "long-term memory. Useful at the start of a task to surface " +
    "preferences, prior context, or facts the user has shared with this " +
    "agent in earlier sessions. Returns up to top_k matches ranked by " +
    "semantic distance.",
  kind: "read",
  args: schema,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        minLength: 1,
        maxLength: 4096,
        description: "Natural-language query to search remembered facts.",
      },
      top_k: {
        type: "integer",
        minimum: TOP_K_MIN,
        maximum: TOP_K_MAX,
        description: `Maximum number of matches to return. Defaults to ${TOP_K_DEFAULT}.`,
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute({ query, top_k }, ctx) {
    if (!ctx.agentId) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "memory_recall is only available inside an agent chat invocation.",
      );
    }
    const limit = top_k ?? TOP_K_DEFAULT;
    const result = await ctx.memwal.recall(ctx.agentId, query, limit);
    const payload = {
      namespace: ctx.memwal.namespaceFor(ctx.agentId),
      top_k: limit,
      total: result.total,
      hits: result.results.map((m) => ({
        text: m.text,
        distance: m.distance,
        blob_id: m.blob_id,
      })),
    };
    return {
      text: jsonText(payload),
      structured: {
        namespace: payload.namespace,
        top_k: limit,
        hit_count: result.results.length,
      },
    };
  },
};
