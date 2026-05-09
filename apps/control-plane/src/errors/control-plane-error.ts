import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Closed union of error codes the control plane returns. Clients (dashboard,
 * boot scripts, future SDK) branch on `code` so the set is part of the
 * public contract — extend with care.
 */
export type ControlPlaneErrorCode =
  | "InvalidArgument"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "RateLimited"
  | "InternalError";

const STATUS_BY_CODE: Record<ControlPlaneErrorCode, HttpStatus> = {
  InvalidArgument: HttpStatus.BAD_REQUEST,
  Unauthorized: HttpStatus.UNAUTHORIZED,
  Forbidden: HttpStatus.FORBIDDEN,
  NotFound: HttpStatus.NOT_FOUND,
  Conflict: HttpStatus.CONFLICT,
  RateLimited: HttpStatus.TOO_MANY_REQUESTS,
  InternalError: HttpStatus.INTERNAL_SERVER_ERROR,
};

export class ControlPlaneError extends HttpException {
  constructor(
    public readonly code: ControlPlaneErrorCode,
    public readonly userMessage: string,
    public readonly details: Record<string, string> = {},
  ) {
    super({ code, userMessage, details }, STATUS_BY_CODE[code]);
  }
}
