/**
 * AWS S3 errors return XML with a specific shape. Boto3 (and other AWS
 * SDKs) branch on `<Code>` — getting that string wrong silently breaks
 * client-side error handling.
 *
 * Canonical error codes documented at
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html
 *
 * This module exposes:
 *   - `S3ErrorCode` — the union of codes we use
 *   - `S3Error` — extends `HttpException`; the global filter in
 *     `s3-error.filter.ts` serializes it to XML
 */

import { HttpException, HttpStatus } from "@nestjs/common";

export type S3ErrorCode =
  | "AccessDenied"
  | "AccountCancelled"
  | "BadDigest"
  | "BucketAlreadyExists"
  | "BucketNotEmpty"
  | "EntityTooLarge"
  | "IncompleteBody"
  | "InternalError"
  | "InvalidAccessKeyId"
  | "InvalidArgument"
  | "InvalidDigest"
  | "InvalidRequest"
  | "KeyAccessRevoked"
  | "MalformedDate"
  | "MetadataTooLarge"
  | "MissingContentLength"
  | "NoSuchBucket"
  | "NoSuchKey"
  | "NotImplemented"
  | "RequestExpired"
  | "RequestTimeTooSkewed"
  // Transient backend unavailability (Walrus aggregator down, Seal key
  // server timeout). Boto3 auto-retries on 503 with capped exponential
  // backoff; clients get a free retry without us re-implementing it.
  | "ServiceUnavailable"
  | "SignatureDoesNotMatch"
  | "XAmzContentSHA256Mismatch";

const STATUS_BY_CODE: Record<S3ErrorCode, HttpStatus> = {
  AccessDenied: HttpStatus.FORBIDDEN,
  AccountCancelled: HttpStatus.FORBIDDEN,
  BadDigest: HttpStatus.BAD_REQUEST,
  BucketAlreadyExists: HttpStatus.CONFLICT,
  BucketNotEmpty: HttpStatus.CONFLICT,
  EntityTooLarge: HttpStatus.BAD_REQUEST,
  IncompleteBody: HttpStatus.BAD_REQUEST,
  InternalError: HttpStatus.INTERNAL_SERVER_ERROR,
  InvalidAccessKeyId: HttpStatus.FORBIDDEN,
  InvalidArgument: HttpStatus.BAD_REQUEST,
  InvalidDigest: HttpStatus.BAD_REQUEST,
  InvalidRequest: HttpStatus.BAD_REQUEST,
  KeyAccessRevoked: HttpStatus.FORBIDDEN,
  MalformedDate: HttpStatus.BAD_REQUEST,
  MetadataTooLarge: HttpStatus.BAD_REQUEST,
  MissingContentLength: HttpStatus.LENGTH_REQUIRED,
  NoSuchBucket: HttpStatus.NOT_FOUND,
  NoSuchKey: HttpStatus.NOT_FOUND,
  NotImplemented: HttpStatus.NOT_IMPLEMENTED,
  RequestExpired: HttpStatus.FORBIDDEN,
  RequestTimeTooSkewed: HttpStatus.FORBIDDEN,
  ServiceUnavailable: HttpStatus.SERVICE_UNAVAILABLE,
  SignatureDoesNotMatch: HttpStatus.FORBIDDEN,
  XAmzContentSHA256Mismatch: HttpStatus.BAD_REQUEST,
};

export class S3Error extends HttpException {
  constructor(
    public readonly code: S3ErrorCode,
    public readonly userMessage: string,
    public readonly details: Record<string, string> = {},
  ) {
    super({ code, userMessage, details }, STATUS_BY_CODE[code]);
  }
}
