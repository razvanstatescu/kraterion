import {
  All,
  Controller,
  Logger,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpAuthGuard } from "./mcp.auth.guard.js";
import { McpToolsService } from "./mcp.tools.js";

/**
 * MCP endpoint, mounted as `POST/GET/DELETE /mcp`.
 *
 * Why `@All("mcp")`: the Streamable HTTP transport ([MCP spec
 * 2025-11](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http))
 * uses one URL with three verbs:
 *
 *   - **POST**   — client → server JSON-RPC requests (the "send" path).
 *   - **GET**    — server → client SSE notifications (the "receive"
 *                  path; the transport upgrades the response to SSE).
 *   - **DELETE** — explicit session close.
 *
 * The transport's `handleRequest(req, res, body)` dispatches by verb
 * internally; we just need to route every method to it.
 *
 * Why stateless (`sessionIdGenerator: undefined`):
 *   K3a doesn't persist session state. Every POST is self-contained;
 *   the agent's MCP client can re-init on reconnect. Stateful mode
 *   (Mcp-Session-Id with in-memory message history) is post-hackathon
 *   — useful for long-running tool sessions but not a v1 demo
 *   requirement.
 *
 * Auth: invoked manually before handing the request to the transport,
 * because the SDK's `handleRequest()` short-circuits Nest's
 * decorator-based guards. On 401 we write
 * `WWW-Authenticate: Bearer realm="kraterion-mcp"` so K3b can extend
 * with `resource_metadata="..."` (RFC 9728) without touching this
 * controller.
 */
@Controller()
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly auth: McpAuthGuard,
    private readonly tools: McpToolsService,
  ) {}

  @All("mcp")
  async handle(@Req() req: FastifyRequest, @Res({ passthrough: false }) reply: FastifyReply): Promise<void> {
    const baseUrl = baseUrlFromRequest(req);
    const resourceUrl = `${baseUrl}/mcp`;
    const principal = await this.auth.authenticate(
      typeof req.headers["authorization"] === "string"
        ? req.headers["authorization"]
        : undefined,
      resourceUrl,
    );
    if (!principal) {
      this.write401(reply, baseUrl);
      return;
    }

    // Fresh `McpServer` per request keeps tool registrations scoped to
    // the authenticated principal — no cross-principal state leakage.
    // The construction is cheap; the SDK's high-level API is
    // built for this pattern.
    const server = new McpServer(
      {
        name: "kraterion-mcp",
        version: "0.1.0",
      },
      {
        instructions:
          "Kraterion exposes seven tools for browsing buckets, reading and " +
          "writing objects, and querying Knowledge-enabled buckets via " +
          "hybrid BM25 + vector retrieval. Every object lives on Walrus as " +
          "an on-chain SharedBlob owned by the user; chunk hashes returned " +
          "from `search`/`ask` are reproducible from the on-chain manifest.",
      },
    );
    this.tools.registerAll(server, principal);

    // Stateless: omitting `sessionIdGenerator` entirely (rather than
    // setting it to `undefined`) disables session management. The
    // option type is declared optional, but with our
    // `exactOptionalPropertyTypes: true` tsconfig the literal
    // `undefined` value is rejected. Empty options object = stateless.
    const transport = new StreamableHTTPServerTransport({});

    // Bidirectional close: when the SDK closes the transport (e.g.
    // client disconnect mid-SSE), tear down the per-request server.
    // `Transport.onclose` is typed as `(() => void) | undefined`, but
    // `server.connect()` parameters expect the non-undefined union with
    // exactOptionalPropertyTypes. A targeted cast keeps the assignment
    // explicit at the type level.
    transport.onclose = () => {
      void server.close().catch((err) => {
        this.logger.warn(`McpServer close failed: ${(err as Error).message}`);
      });
    };
    transport.onerror = (err: Error) => {
      this.logger.warn(`MCP transport error: ${err.message}`);
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await server.connect(transport as any);
      // Fastify's `request.body` is already parsed (JSON body parser
      // is on by default). The transport's `handleRequest` expects the
      // pre-parsed body for POSTs; passing it skips a re-parse.
      await transport.handleRequest(
        req.raw as unknown as Parameters<typeof transport.handleRequest>[0],
        reply.raw as unknown as Parameters<typeof transport.handleRequest>[1],
        req.body,
      );
    } catch (err) {
      this.logger.error(`MCP /mcp handler crashed: ${(err as Error).message}`);
      // The transport may have already written headers — only emit our
      // own 500 if the response is still pristine.
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.setHeader("Content-Type", "application/json");
        reply.raw.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal MCP server error" },
            id: null,
          }),
        );
      }
    }
  }

  /**
   * 401 response shape. `WWW-Authenticate` carries both the realm and a
   * `resource_metadata=` link (RFC 9728) so OAuth-aware MCP clients can
   * discover `/oauth/authorize` and `/oauth/token` without out-of-band
   * configuration. K3a's API-key clients ignore the metadata link and
   * fall back to the realm prompt.
   */
  private write401(reply: FastifyReply, baseUrl: string): void {
    const resourceMetadata = `${baseUrl}/.well-known/oauth-protected-resource`;
    reply.raw.statusCode = 401;
    reply.raw.setHeader(
      "WWW-Authenticate",
      `Bearer realm="kraterion-mcp", resource_metadata="${resourceMetadata}"`,
    );
    reply.raw.setHeader("Content-Type", "application/json");
    reply.raw.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Missing or invalid bearer credentials. Either send " +
            'Authorization: Bearer "<AKIA>:<secret>" from a non-revoked ' +
            "Kraterion API key, or complete the OAuth flow advertised at " +
            "the resource_metadata URL.",
        },
        id: null,
      }),
    );
  }
}

/**
 * Resource URL the OAuth `aud` claim must match (RFC 8707). Derived
 * from the request so localhost dev and production-behind-proxy both
 * work; relies on the gateway/dashboard sharing the same LB so
 * `x-forwarded-*` is trusted.
 */
function baseUrlFromRequest(req: FastifyRequest): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "http";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    (req.headers["host"] as string | undefined) ??
    "localhost:4001";
  return `${proto}://${host}`;
}
