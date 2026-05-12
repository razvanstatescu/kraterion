"use client";

/**
 * Object I/O via the CP's presigned-headers endpoints + direct gateway fetches.
 *
 * The CP holds the AES-wrapped API-key secret in Postgres; it unwraps and
 * signs a SigV4 request envelope (`X-Amz-Content-Sha256: UNSIGNED-PAYLOAD`)
 * on demand. The dashboard never sees a secret — it just sends the bytes
 * to the URL the CP returned, with the signed headers attached.
 *
 * `useUpload` and `useDownload` are mutations because they have side
 * effects on-chain (PutObject wraps a SharedBlob; DeleteObject soft-deletes).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cpFetch, type BucketJson, type S3ObjectJson } from "./api";
import { decryptObjectInBrowser, type SealSuiClient, type SignPersonalMessage } from "./seal";

export interface SignedRequest {
  method: "PUT" | "GET" | "DELETE";
  url: string;
  headers: Record<string, string>;
  expires_at: string;
}

// === CP-side prepares ========================================================

export function usePrepareUpload() {
  return useMutation({
    mutationFn: async (args: { bucket_id: string; key: string; content_type?: string }) =>
      cpFetch<SignedRequest>("/v1/objects/prepare-upload", {
        method: "POST",
        body: args,
      }),
  });
}

export function usePrepareDownload() {
  return useMutation({
    mutationFn: async (objectId: string) =>
      cpFetch<SignedRequest>(`/v1/objects/${objectId}/prepare-download`, {
        method: "POST",
      }),
  });
}

/**
 * Mints a stand-alone shareable download URL — query-string SigV4, no
 * auth headers required. Anyone with the URL can fetch the object until
 * the URL expires (5 minutes from issuance).
 */
export function usePrepareShareLink() {
  return useMutation({
    mutationFn: async (objectId: string) =>
      cpFetch<SignedRequest>(`/v1/objects/${objectId}/prepare-download`, {
        method: "POST",
        body: { share: true },
      }),
  });
}

export function usePrepareDelete() {
  return useMutation({
    mutationFn: async (objectId: string) =>
      cpFetch<SignedRequest>(`/v1/objects/${objectId}/prepare-delete`, {
        method: "POST",
      }),
  });
}

// === High-level helpers ======================================================

/**
 * Upload a file via the CP-signed envelope. Optionally reports progress
 * (0..1) via `onProgress` — we use `XMLHttpRequest` instead of `fetch`
 * because `fetch` upload streams have inconsistent progress events across
 * browsers as of late 2025.
 */
export function uploadWithProgress(args: {
  signed: SignedRequest;
  file: File | Blob;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(args.signed.method, args.signed.url);
    for (const [name, value] of Object.entries(args.signed.headers)) {
      try {
        xhr.setRequestHeader(name, value);
      } catch {
        // Some browsers reject setting forbidden headers (Host etc).
        // CP filters those out already, but be defensive.
      }
    }
    if (args.onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && args.onProgress) {
          args.onProgress(e.loaded / e.total);
        }
      });
    }
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Gateway returned ${xhr.status}: ${xhr.responseText.slice(0, 256)}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new DOMException("Upload aborted", "AbortError")));
    if (args.signal) {
      args.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(args.file);
  });
}

/** Stream-download via the signed GET envelope; returns a `Blob`. */
export async function downloadAsBlob(signed: SignedRequest): Promise<Blob> {
  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway returned ${res.status}: ${text.slice(0, 256)}`);
  }
  return res.blob();
}

/** Trigger a browser download via an anchor click. */
export async function downloadToDisk(signed: SignedRequest, filename: string): Promise<void> {
  const blob = await downloadAsBlob(signed);
  await saveBlobAsFile(blob, filename);
}

/**
 * Browser-native download path for private files. Skips the gateway
 * entirely: ciphertext comes from the public Walrus aggregator and Seal
 * decrypts in the browser with a SessionKey signed by the bucket owner.
 * Survives platform API revocation — that's the demo moment.
 */
export async function downloadPrivateInBrowser(args: {
  suiClient: SealSuiClient;
  accountAddress: string;
  signPersonalMessage: SignPersonalMessage;
  object: S3ObjectJson;
  bucket: BucketJson;
  filename: string;
  contentType?: string | null;
}): Promise<void> {
  const plaintext = await decryptObjectInBrowser({
    suiClient: args.suiClient,
    accountAddress: args.accountAddress,
    signPersonalMessage: args.signPersonalMessage,
    object: args.object,
    bucket: args.bucket,
  });
  // Re-wrap the SDK's `Uint8Array<ArrayBufferLike>` as a plain
  // `ArrayBuffer` slice. Modern TypeScript treats `ArrayBufferLike` as
  // a SharedArrayBuffer-possible parent, but `Blob` only accepts the
  // narrower type — the copy is cheap relative to the decrypt itself.
  const buffer = plaintext.buffer.slice(
    plaintext.byteOffset,
    plaintext.byteOffset + plaintext.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: args.contentType ?? args.object.content_type ?? "application/octet-stream",
  });
  await saveBlobAsFile(blob, args.filename);
}

async function saveBlobAsFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Execute the signed DELETE. The gateway soft-deletes the row. */
export async function deleteSigned(signed: SignedRequest): Promise<void> {
  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Gateway returned ${res.status}: ${text.slice(0, 256)}`);
  }
}

/**
 * Invalidate the React Query cache for a bucket's objects after a
 * mutation. The CP serializes BigInts as strings, so we just bust the
 * keyed cache rather than try to patch in place.
 */
export function useInvalidateBucketObjects() {
  const queryClient = useQueryClient();
  return (bucketId: string) => {
    void queryClient.invalidateQueries({ queryKey: ["v1", "objects", bucketId] });
    void queryClient.invalidateQueries({ queryKey: ["v1", "bucket", bucketId] });
  };
}
