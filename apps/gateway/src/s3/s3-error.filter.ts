import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { S3Error } from "./s3-error.js";

/**
 * Convert thrown errors into AWS-canonical S3 XML error responses.
 *
 * Boto3 and other SDKs branch on `<Code>` text, so the error code MUST
 * exactly match AWS's documented set. See `s3-error.ts` for the closed
 * union we ship.
 *
 * Shape (per
 * https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html):
 *
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <Error>
 *     <Code>SignatureDoesNotMatch</Code>
 *     <Message>...</Message>
 *     <Resource>/bucket/key</Resource>
 *     <RequestId>...</RequestId>
 *     <HostId>...</HostId>
 *     [extra context elements]
 *   </Error>
 */
@Catch()
export class S3ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(S3ExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    const requestId = randomUUID();
    const resource = req.url ?? "/";

    let code: string;
    let message: string;
    let status: number;
    let extras: Record<string, string> = {};

    if (exception instanceof S3Error) {
      code = exception.code;
      message = exception.userMessage;
      status = exception.getStatus();
      extras = exception.details;
    } else if (exception instanceof HttpException) {
      // Plain HttpException — map to InvalidRequest with the message.
      code = "InvalidRequest";
      const resp = exception.getResponse();
      message = typeof resp === "string" ? resp : (resp as { message?: string }).message ?? "Request rejected";
      status = exception.getStatus();
    } else {
      this.logger.error(
        `Unhandled exception: ${(exception as Error)?.stack ?? String(exception)}`,
      );
      code = "InternalError";
      message = "We encountered an internal error. Please try again.";
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const xml = renderErrorXml({
      code,
      message,
      resource,
      requestId,
      hostId: requestId, // hackathon: HostId == RequestId
      extras,
    });

    void reply
      .header("Content-Type", "application/xml")
      .header("x-amz-request-id", requestId)
      .header("x-amz-id-2", requestId)
      .status(status)
      .send(xml);
  }
}

function renderErrorXml(opts: {
  code: string;
  message: string;
  resource: string;
  requestId: string;
  hostId: string;
  extras: Record<string, string>;
}): string {
  const tags: string[] = [
    `<Code>${escapeXml(opts.code)}</Code>`,
    `<Message>${escapeXml(opts.message)}</Message>`,
    `<Resource>${escapeXml(opts.resource)}</Resource>`,
    `<RequestId>${escapeXml(opts.requestId)}</RequestId>`,
    `<HostId>${escapeXml(opts.hostId)}</HostId>`,
  ];
  for (const [k, v] of Object.entries(opts.extras)) {
    tags.push(`<${k}>${escapeXml(v)}</${k}>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Error>${tags.join("")}</Error>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
