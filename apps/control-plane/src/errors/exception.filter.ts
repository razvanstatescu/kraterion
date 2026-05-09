import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { ControlPlaneError, type ControlPlaneErrorCode } from "./control-plane-error.js";

/**
 * Convert thrown errors into the control-plane JSON envelope:
 *   { error: { code, message, details?, requestId } }
 *
 * Discrimination ladder:
 *   ControlPlaneError → use as-is.
 *   HttpException     → map by status (401 → Unauthorized, 403 → Forbidden,
 *                       404 → NotFound, anything else → InvalidArgument).
 *   anything else     → InternalError (and log the stack).
 *
 * Every response carries `x-request-id`; clients can quote it back in
 * support requests.
 */
@Catch()
export class ControlPlaneExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ControlPlaneExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    const requestId = randomUUID();
    let code: ControlPlaneErrorCode;
    let message: string;
    let status: number;
    let details: Record<string, string> = {};

    if (exception instanceof ControlPlaneError) {
      code = exception.code;
      message = exception.userMessage;
      status = exception.getStatus();
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = mapHttpStatusToCode(status);
      const resp = exception.getResponse();
      message =
        typeof resp === "string"
          ? resp
          : (resp as { message?: string }).message ?? exception.message ?? "Request rejected";
    } else {
      this.logger.error(
        `Unhandled exception: ${(exception as Error)?.stack ?? String(exception)}`,
      );
      code = "InternalError";
      message = "We encountered an internal error. Please try again.";
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const body: { error: { code: string; message: string; details?: Record<string, string>; requestId: string } } = {
      error: { code, message, requestId },
    };
    if (Object.keys(details).length > 0) {
      body.error.details = details;
    }

    void reply
      .header("Content-Type", "application/json")
      .header("x-request-id", requestId)
      .status(status)
      .send(body);
  }
}

function mapHttpStatusToCode(status: number): ControlPlaneErrorCode {
  if (status === HttpStatus.UNAUTHORIZED) return "Unauthorized";
  if (status === HttpStatus.FORBIDDEN) return "Forbidden";
  if (status === HttpStatus.NOT_FOUND) return "NotFound";
  if (status === HttpStatus.CONFLICT) return "Conflict";
  if (status === HttpStatus.TOO_MANY_REQUESTS) return "RateLimited";
  if (status >= 500) return "InternalError";
  return "InvalidArgument";
}
