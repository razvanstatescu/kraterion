import { Injectable, Logger } from "@nestjs/common";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL_ID } from "@kraterion/shared";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { serializeBucket, serializeObject } from "../buckets/serialize.js";
import { answerWithLLM } from "../knowledge/ask.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { PresignService } from "../objects/presign.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProviderCredentialService } from "../providers/provider-credential.service.js";
import type { McpPrincipal } from "./mcp.types.js";

/**
 * MCP tool implementations — the seven tools the agent surface
 * exposes (per `docs/ai-features-plan.md` §2.2):
 *
 *   - `kraterion_list_buckets`
 *   - `kraterion_list_objects(bucket, prefix?)`
 *   - `kraterion_search(bucket, query, top_k?)`
 *   - `kraterion_ask(bucket, query, openai_api_key, model?, top_k?)`
 *   - `kraterion_read_object(bucket, key)`
 *   - `kraterion_write_object(bucket, key, content, content_type?)`
 *   - `kraterion_get_manifest(bucket, key)`
 *
 * Implementations are **in-process** — every tool calls the same
 * NestJS services the dashboard's REST endpoints call. That keeps the
 * MCP surface byte-equivalent with the REST API: revocation, audit,
 * Knowledge gating, all apply uniformly.
 *
 * `read_object` and `write_object` proxy through the gateway via
 * CP-signed SigV4 envelopes — same as the dashboard. The CP fetches
 * (or PUTs) bytes server-to-server, so the agent never holds a
 * Kraterion S3 secret.
 *
 * Why a Nest service, not a free module: tool handlers need DI to
 * reach `BucketsService`, `KnowledgeService`, `PresignService`,
 * `PrismaService`. Wrapping the registration in a Nest provider
 * means we don't hand-thread dependencies through closures and the
 * controller stays small.
 */

const READ_BYTES_CAP = 1 * 1024 * 1024; // 1 MiB cap on read_object responses
const WRITE_BYTES_CAP = 5 * 1024 * 1024; // 5 MiB cap on write_object input

@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buckets: BucketsService,
    private readonly knowledge: KnowledgeService,
    private readonly presign: PresignService,
    private readonly credentials: ProviderCredentialService,
  ) {}

  /** Resolve `(account_id, bucket_name)` to a `Bucket` row. */
  private async findBucketByName(accountId: string, name: string) {
    const bucket = await this.prisma.bucket.findFirst({
      where: {
        name,
        deleted_at: null,
        project: { account_id: accountId },
      },
    });
    if (!bucket) {
      throw new ControlPlaneError("NotFound", `Bucket "${name}" not found`);
    }
    return bucket;
  }

  /**
   * Register all seven tools on a fresh `McpServer`. We re-register
   * for every transport instance because `registerTool` mutates the
   * server's tool map — fine, because the registrations are pure
   * functions of the principal.
   */
  registerAll(server: McpServer, principal: McpPrincipal): void {
    this.registerListBuckets(server, principal);
    this.registerListObjects(server, principal);
    this.registerSearch(server, principal);
    this.registerAsk(server, principal);
    this.registerReadObject(server, principal);
    this.registerWriteObject(server, principal);
    this.registerGetManifest(server, principal);
  }

  // === Bucket-level tools ===

  private registerListBuckets(server: McpServer, principal: McpPrincipal): void {
    server.registerTool(
      "kraterion_list_buckets",
      {
        description:
          "List the buckets in the authenticated Kraterion project, " +
          "including encryption mode, on-chain object id, and " +
          "indexer status. Returns an array.",
        inputSchema: {},
      },
      async () => {
        const page = await this.buckets.listForAccount(principal.account_id, {
          projectId: principal.project_id,
          includeDeleted: false,
          limit: 100,
        });
        const rows = page.items.map((b) => serializeBucket(b));
        return textJson(rows);
      },
    );
  }

  private registerListObjects(server: McpServer, principal: McpPrincipal): void {
    server.registerTool(
      "kraterion_list_objects",
      {
        description:
          "List objects in a bucket, optionally filtered by a key prefix. " +
          "Returns the first page (up to 100 objects); use `cursor` from " +
          "the response to fetch more.",
        inputSchema: {
          bucket: z.string().min(1).describe("Bucket name."),
          prefix: z.string().optional().describe("S3 key prefix filter."),
          limit: z.number().int().min(1).max(1000).optional(),
        },
      },
      async ({ bucket: bucketName, prefix, limit }) => {
        const bucket = await this.findBucketByName(principal.account_id, bucketName);
        const page = await this.buckets.listObjects(principal.account_id, bucket.id, {
          includeDeleted: false,
          limit: limit ?? 100,
          ...(prefix ? { prefix } : {}),
        });
        return textJson({
          bucket: bucket.name,
          objects: page.items.map(serializeObject),
          next_cursor: page.next_cursor,
        });
      },
    );
  }

  // === Knowledge tools (require KnowledgeBucketSettings) ===

  private registerSearch(server: McpServer, principal: McpPrincipal): void {
    server.registerTool(
      "kraterion_search",
      {
        description:
          "Search a knowledge-enabled bucket using natural language. " +
          "Returns the top chunks ranked by hybrid BM25 + vector " +
          "retrieval with reciprocal-rank fusion. Each hit includes " +
          "the chunk content, the source object's S3 key + ordinal, " +
          "and a SHA-256 chunk hash usable as a verifiable citation.",
        inputSchema: {
          bucket: z.string().min(1),
          query: z.string().min(1).max(4096),
          top_k: z.number().int().min(1).max(32).optional(),
        },
      },
      async ({ bucket: bucketName, query, top_k }) => {
        const bucket = await this.findBucketByName(principal.account_id, bucketName);
        const result = await this.knowledge.search({
          accountId: principal.account_id,
          bucketId: bucket.id,
          query,
          ...(top_k !== undefined ? { topK: top_k } : {}),
        });
        await this.knowledge.recordQuery({
          bucketId: bucket.id,
          projectId: principal.project_id,
          apiKeyId: principal.api_key_id ?? null,
          kind: "search",
          query,
          topK: top_k ?? 8,
          latencyMs: result.latency_ms,
          chunkHashes: result.hits.map((h) => h.content_hash),
        });
        return textJson(result);
      },
    );
  }

  private registerAsk(server: McpServer, principal: McpPrincipal): void {
    server.registerTool(
      "kraterion_ask",
      {
        description:
          "Answer a natural-language question grounded in a bucket's " +
          "knowledge index. Uses the OpenAI API key the project owner " +
          "configured on /keys — the agent does not supply one. Returns " +
          "the answer plus the chunk hashes that backed it.",
        inputSchema: {
          bucket: z.string().min(1),
          query: z.string().min(1).max(4096),
          model: z
            .string()
            .optional()
            .describe("Defaults to `gpt-4o-mini`."),
          top_k: z.number().int().min(1).max(32).optional(),
        },
      },
      async ({ bucket: bucketName, query, model, top_k }) => {
        const bucket = await this.findBucketByName(principal.account_id, bucketName);
        const retrieved = await this.knowledge.search({
          accountId: principal.account_id,
          bucketId: bucket.id,
          query,
          ...(top_k !== undefined ? { topK: top_k } : {}),
          efSearch: 96,
        });
        // Same model-resolution chain as the REST /ask: per-call
        // override > bucket default_llm_model > global default.
        const settings = await this.prisma.knowledgeBucketSettings.findUnique({
          where: { bucket_id: bucket.id },
          select: { default_llm_model: true },
        });
        const chosenModel =
          model ?? settings?.default_llm_model ?? DEFAULT_CHAT_MODEL_ID;
        const answered = await this.credentials.useDecrypted(
          principal.project_id,
          "openai",
          (apiKey) =>
            answerWithLLM({
              query,
              hits: retrieved.hits,
              apiKey,
              model: chosenModel,
            }),
        );
        await this.knowledge.recordQuery({
          bucketId: bucket.id,
          projectId: principal.project_id,
          apiKeyId: principal.api_key_id ?? null,
          kind: "ask",
          query,
          topK: top_k ?? 8,
          latencyMs: retrieved.latency_ms,
          chunkHashes: retrieved.hits.map((h) => h.content_hash),
          llmModel: answered.model,
          llmTokens: answered.prompt_tokens + answered.completion_tokens,
        });
        return textJson({
          answer: answered.answer,
          citations: answered.citations,
          retrieval: {
            embedding_model: retrieved.embedding_model,
            embedding_dimensions: retrieved.embedding_dimensions,
            latency_ms: retrieved.latency_ms,
            hit_count: retrieved.hits.length,
          },
          llm: {
            model: answered.model,
            prompt_tokens: answered.prompt_tokens,
            completion_tokens: answered.completion_tokens,
          },
        });
      },
    );
  }

  // === Object I/O — proxied through the gateway via CP-signed SigV4 ===

  private registerReadObject(server: McpServer, principal: McpPrincipal): void {
    server.registerTool(
      "kraterion_read_object",
      {
        description:
          `Read a single object's content as UTF-8 text. Capped at ${READ_BYTES_CAP} ` +
          "bytes — for larger objects use the chunk search tools instead. " +
          "Binary content is base64-encoded.",
        inputSchema: {
          bucket: z.string().min(1),
          key: z.string().min(1).max(1024),
        },
      },
      async ({ bucket: bucketName, key }) => {
        const bucket = await this.findBucketByName(principal.account_id, bucketName);
        const object = await this.prisma.s3Object.findFirst({
          where: { bucket_id: bucket.id, s3_key: key, deleted_at: null },
        });
        if (!object) {
          throw new ControlPlaneError("NotFound", `Object "${key}" not found in "${bucketName}"`);
        }
        if (Number(object.size_bytes) > READ_BYTES_CAP) {
          throw new ControlPlaneError(
            "InvalidArgument",
            `Object is ${object.size_bytes} bytes — read_object caps responses at ` +
              `${READ_BYTES_CAP}. Use kraterion_search to retrieve relevant chunks instead.`,
          );
        }

        const signed = await this.presign.signDownload({
          accountId: principal.account_id,
          objectId: object.id,
        });
        const res = await fetch(signed.url, {
          method: "GET",
          headers: signed.headers,
        });
        if (!res.ok) {
          throw new ControlPlaneError(
            "InternalError",
            `Gateway returned ${res.status} reading "${key}"`,
          );
        }
        const buf = Buffer.from(await res.arrayBuffer());

        // Decode as UTF-8 if the content type looks textual; otherwise
        // return base64 + a hint so the agent can decode itself.
        const ct = (object.content_type ?? "").toLowerCase();
        const looksTextual =
          ct.startsWith("text/") ||
          ct === "application/json" ||
          ct === "application/xml" ||
          ct === "application/x-yaml" ||
          ct === "application/javascript";
        if (looksTextual) {
          return textJson({
            s3_key: object.s3_key,
            content_type: object.content_type,
            content: buf.toString("utf8"),
            encoding: "utf-8",
            size_bytes: buf.byteLength,
          });
        }
        return textJson({
          s3_key: object.s3_key,
          content_type: object.content_type,
          content_base64: buf.toString("base64"),
          encoding: "base64",
          size_bytes: buf.byteLength,
        });
      },
    );
  }

  private registerWriteObject(server: McpServer, principal: McpPrincipal): void {
    server.registerTool(
      "kraterion_write_object",
      {
        description:
          `Upload a small UTF-8 text object to a bucket. Capped at ${WRITE_BYTES_CAP} ` +
          "bytes. Triggers on-chain SharedBlob creation and (if the bucket has " +
          "Knowledge enabled) automatic embedding within ~30s. Returns the " +
          "Walrus blob id once the indexer has caught up.",
        inputSchema: {
          bucket: z.string().min(1),
          key: z.string().min(1).max(1024),
          content: z.string().min(0).max(WRITE_BYTES_CAP),
          content_type: z
            .string()
            .max(255)
            .optional()
            .describe("Defaults to `text/plain; charset=utf-8`."),
        },
      },
      async ({ bucket: bucketName, key, content, content_type }) => {
        const bucket = await this.findBucketByName(principal.account_id, bucketName);
        const contentBuf = Buffer.from(content, "utf8");
        if (contentBuf.byteLength > WRITE_BYTES_CAP) {
          throw new ControlPlaneError(
            "InvalidArgument",
            `Content is ${contentBuf.byteLength} bytes after UTF-8 encoding; cap is ${WRITE_BYTES_CAP}.`,
          );
        }
        const ct = content_type ?? "text/plain; charset=utf-8";
        const signed = await this.presign.signUpload({
          accountId: principal.account_id,
          bucketId: bucket.id,
          key,
          contentType: ct,
        });
        const res = await fetch(signed.url, {
          method: "PUT",
          headers: signed.headers,
          body: contentBuf,
        });
        if (!res.ok) {
          const body = await res.text();
          throw new ControlPlaneError(
            "InternalError",
            `Gateway returned ${res.status} writing "${key}": ${body.slice(0, 256)}`,
          );
        }
        const etag = res.headers.get("etag") ?? null;
        return textJson({
          bucket: bucket.name,
          s3_key: key,
          content_type: ct,
          size_bytes: contentBuf.byteLength,
          etag,
          note:
            "On-chain SharedBlob created. The indexer writes the DB row + " +
            "triggers Knowledge embedding (if enabled) within ~30s.",
        });
      },
    );
  }

  // === Verifiability hook ===

  private registerGetManifest(server: McpServer, principal: McpPrincipal): void {
    server.registerTool(
      "kraterion_get_manifest",
      {
        description:
          "Fetch the Knowledge indexing manifest for an object — chunk count, " +
          "embedding model, indexer status, and (once K5 lands) a Walrus blob id " +
          "pointing at the on-chain manifest archive. The manifest is the " +
          "verifiability hook: given chunk hashes returned by a previous search/ask, " +
          "the on-chain manifest proves how the chunks were derived.",
        inputSchema: {
          bucket: z.string().min(1),
          key: z.string().min(1).max(1024),
        },
      },
      async ({ bucket: bucketName, key }) => {
        const bucket = await this.findBucketByName(principal.account_id, bucketName);
        const object = await this.prisma.s3Object.findFirst({
          where: { bucket_id: bucket.id, s3_key: key, deleted_at: null },
        });
        if (!object) {
          throw new ControlPlaneError(
            "NotFound",
            `Object "${key}" not found in "${bucketName}"`,
          );
        }
        const manifest = await this.prisma.knowledgeManifest.findFirst({
          where: { s3_object_id: object.id, deleted_at: null },
          orderBy: { version: "desc" },
        });
        if (!manifest) {
          return textJson({
            indexed: false,
            note:
              "No Knowledge manifest for this object. Enable Knowledge on the " +
              "bucket and re-upload (or trigger a backfill) to index it.",
          });
        }
        return textJson({
          indexed: true,
          manifest: {
            version: manifest.version,
            status: manifest.status,
            skip_reason: manifest.skip_reason,
            chunk_count: manifest.chunk_count,
            embedding_model: manifest.embedding_model,
            embedding_dimensions: manifest.embedding_dimensions,
            embedding_tokens: manifest.embedding_tokens,
            bytes_in: manifest.bytes_in.toString(),
            bytes_indexed: manifest.bytes_indexed.toString(),
            walrus_blob_id: manifest.manifest_walrus_blob_id,
            shared_blob_object_id: manifest.manifest_shared_blob_object_id,
            started_at: manifest.started_at?.toISOString() ?? null,
            finished_at: manifest.finished_at?.toISOString() ?? null,
          },
        });
      },
    );
  }
}

/**
 * MCP tool results are an array of `Content` items. For our seven
 * tools the response is a JSON document — wrap it in a single
 * `text` content item with the JSON serialized + a `2`-space pretty
 * print so agents that show the raw output stay readable.
 */
function textJson(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, jsonReplacer, 2),
      },
    ],
  };
}

/**
 * Standardize BigInt → string in JSON output so tools that return
 * `size_bytes` etc. don't trip `JSON.stringify`'s default BigInt
 * `TypeError`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonReplacer(_key: string, value: any): any {
  return typeof value === "bigint" ? value.toString() : value;
}
