import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { getManifestTool } from "./get-manifest.js";
import { listBucketsTool } from "./list-buckets.js";
import { listObjectsTool } from "./list-objects.js";
import { memoryRecallTool } from "./memory-recall.js";
import { memoryRememberTool } from "./memory-remember.js";
import { readObjectTool } from "./read-object.js";
import { searchTool } from "./search.js";
import { writeObjectTool } from "./write-object.js";
import type { ToolContext, ToolDef, ToolResult } from "./types.js";

/**
 * Authoritative catalog of built-in agent tools. The agent chat
 * endpoint reads `forNames(...)` to feed OpenAI's `tools` param; the
 * MCP server reads `all()` to register the equivalent tools/list
 * surface. One source, two callers — no drift.
 *
 * Adding a new tool: implement it as a `ToolDef` (see `types.ts`) and
 * register it in the `CATALOG` array below. Then add the matching
 * metadata row in `apps/dashboard/src/lib/agent-tools.ts` so the
 * dashboard's Tools step displays it. The server is the source of
 * truth — an unknown tool name is rejected at `agents.service` write
 * time.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CATALOG: ToolDef<any>[] = [
  searchTool,
  listBucketsTool,
  listObjectsTool,
  readObjectTool,
  writeObjectTool,
  getManifestTool,
  memoryRememberTool,
  memoryRecallTool,
];

const BY_NAME = new Map(CATALOG.map((t) => [t.name, t]));

@Injectable()
export class AgentToolRegistry {
  /** Names of every registered tool. */
  readonly knownNames: ReadonlySet<string> = new Set(BY_NAME.keys());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all(): readonly ToolDef<any>[] {
    return CATALOG;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(name: string): ToolDef<any> | undefined {
    return BY_NAME.get(name);
  }

  /** Return the subset of tools matching the given names. Unknown names
   *  are silently dropped — the caller is expected to have validated. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forNames(names: readonly string[]): readonly ToolDef<any>[] {
    return names
      .map((n) => BY_NAME.get(n))
      .filter((t): t is ToolDef => t !== undefined);
  }

  /** Build the OpenAI `tools` array for a given set of tool names.
   *  Returns `undefined` when the list is empty so we can omit the
   *  param entirely (some models behave better without an empty array). */
  openAiToolsParam(
    names: readonly string[],
  ): Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> | undefined {
    if (names.length === 0) return undefined;
    const defs = this.forNames(names);
    if (defs.length === 0) return undefined;
    return defs.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /** Validate + execute a tool by name. Throws on unknown / invalid
   *  args (the caller maps these to `tool_role` error messages or
   *  failed audit rows). */
  async execute(
    name: string,
    rawArgs: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = BY_NAME.get(name);
    if (!tool) {
      throw new ControlPlaneError("NotFound", `Unknown tool "${name}"`);
    }
    const parsed = tool.args.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ControlPlaneError(
        "InvalidArgument",
        formatZodError(parsed.error),
        { tool: name },
      );
    }
    return tool.execute(parsed.data, ctx);
  }
}

function formatZodError(err: z.ZodError): string {
  return err.errors
    .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
    .join("; ");
}
