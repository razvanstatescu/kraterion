/**
 * Typed errors thrown by `@kraterion/object-bytes`.
 *
 * Callers (gateway, worker, anywhere else that needs object plaintext)
 * map these to their own error-response shapes — `S3Error` in the
 * gateway, structured worker logs / retries in the embedding pipeline.
 * Keeping them concrete here means we don't smuggle framework-specific
 * exception types across the package boundary.
 */

export class WalrusReadError extends Error {
  override readonly name = "WalrusReadError";
  constructor(message: string, readonly blobId: string, override readonly cause?: unknown) {
    super(message);
  }
}

export class SealDecryptError extends Error {
  override readonly name = "SealDecryptError";
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
  }
}

export class PtbBuildError extends Error {
  override readonly name = "PtbBuildError";
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
  }
}
