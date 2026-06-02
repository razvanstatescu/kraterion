import { z } from "zod";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { jsonText, type ToolDef } from "./types.js";

const CONTENT_MAX = 8192;

const schema = z.object({
  content: z.string().min(1).max(CONTENT_MAX),
});

/**
 * P9 Feature 3 — `memory.remember` agent tool.
 *
 * Persists one self-contained fact in the agent's MemWal namespace
 * (`agent:<agent_id>`). We use MemWal's synchronous
 * `rememberAndWait` so the tool result includes the Walrus blob_id
 * and the model gets confirmation in the next turn. That cost (a
 * second-or-two round-trip) buys a complete audit row: the
 * `AgentToolCall.output_json` carries the blob_id, namespace, and
 * memory id, so the lineage graph shows a fully-resolved receipt for
 * each memory write.
 */
export const memoryRememberTool: ToolDef<typeof schema> = {
  name: "memory_remember",
  label: "Remember",
  description:
    "Persist a fact or preference to this agent's long-term memory so " +
    "future runs can recall it. Use sparingly — only for information " +
    "subsequent turns or sessions are likely to need (user preferences, " +
    "recurring task context, stable identifiers). Don't save ephemeral " +
    "conversational state. Each entry must be self-contained — include " +
    "enough context that a future recall hit makes sense on its own.",
  kind: "write",
  args: schema,
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        minLength: 1,
        maxLength: CONTENT_MAX,
        description:
          "Plain-text fact to remember. Self-contained. Max 8192 chars.",
      },
    },
    required: ["content"],
    additionalProperties: false,
  },
  async execute({ content }, ctx) {
    if (!ctx.agentId) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "memory_remember is only available inside an agent chat invocation.",
      );
    }
    const result = await ctx.memwal.remember(ctx.agentId, content);
    const payload = {
      ok: true,
      id: result.id,
      blob_id: result.blob_id,
      namespace: result.namespace,
      bytes: Buffer.byteLength(content, "utf8"),
    };
    return {
      text: jsonText(payload),
      structured: payload,
      // MemWal writes to Walrus under the hood — surface the blob id so
      // the lineage graph can render a fetch-blob link. No on-chain Sui
      // tx is minted for MemWal v1.
      walrusBlobId: result.blob_id,
    };
  },
};
