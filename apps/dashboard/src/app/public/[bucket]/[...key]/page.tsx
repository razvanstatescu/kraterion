import { redirect } from "next/navigation";

/**
 * Public-link shim. `https://app.kraterion.com/public/<bucket>/<key>`
 * server-redirects to the gateway's unauthenticated public route.
 *
 * Why a redirect instead of proxying bytes:
 *   - The browser hits the gateway directly, so the `Cache-Control`
 *     headers the gateway emits work as intended (no second cache
 *     layer on Vercel / Next.js).
 *   - Range-aware media players (audio, video) talk straight to the
 *     gateway; we don't have to translate `Range:` headers through
 *     Next.js.
 *   - The dashboard never sees the bytes, so leaks via SSR memory
 *     are impossible.
 *
 * The dashboard URL exists mainly so links read as
 * "kraterion.com/public/<bucket>/<key>" in marketing surfaces and
 * pasted into chat; the trailing gateway hop is transparent to the
 * recipient.
 */

interface RouteParams {
  bucket: string;
  /** Catch-all segments — the file key with `/` separators preserved. */
  key: string[];
}

/**
 * Normalize whatever Next.js gives us into a single-encoded URL segment.
 * Next.js 16's catch-all params surface URL-encoded values for keys that
 * contain reserved characters (e.g. `opengraph-image%20(2).png`), but
 * deliver decoded values for vanilla strings. A naive `encodeURIComponent`
 * on the encoded form would produce `%2520` (the `%` itself re-encoded),
 * breaking the gateway's key lookup.
 *
 * `decodeURIComponent` is the right normalizer: it's idempotent over
 * already-decoded input (no `%XX` to undo) and undoes Next's encoding
 * once. Then a single `encodeURIComponent` produces the canonical
 * URL-safe form the gateway expects to receive.
 */
function normalizeSegment(seg: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    // Malformed `%XY` in the input — surface as-is rather than throwing
    // a server error; the gateway will return NoSuchKey for it.
    decoded = seg;
  }
  return encodeURIComponent(decoded);
}

export default async function PublicObjectPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bucket, key } = await params;
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4002";
  const keyPath = key.map(normalizeSegment).join("/");
  const target = `${gatewayUrl}/public/${normalizeSegment(bucket)}/${keyPath}`;
  redirect(target);
}
