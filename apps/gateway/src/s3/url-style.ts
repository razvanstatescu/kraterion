/**
 * Resolve `(bucket?, key?)` from an incoming S3 request — path-style
 * first, virtual-hosted-style as a fallback when the Host header
 * carries the bucket as a subdomain.
 *
 * Path-style (boto3 default for non-AWS endpoints):
 *   GET /bucket/key/with/slashes  Host: api.kraterion.com
 *   → bucket="bucket", key="key/with/slashes"
 *
 * Virtual-hosted-style:
 *   GET /key/with/slashes         Host: bucket.s3.kraterion.com
 *   → bucket="bucket", key="key/with/slashes"
 *
 * `ListBuckets` (root request, no bucket):
 *   GET /                         Host: api.kraterion.com
 *   → bucket=undefined, key=undefined
 *
 * For development we strictly prefer path-style — boto3 is configured
 * with `endpoint_url=http://localhost:4002` and uses path-style by
 * default. Virtual-hosted is a Phase-7 polish item.
 */

export interface UrlStyleResult {
  bucket?: string;
  key?: string;
}

/**
 * Hosts that ARE the gateway itself — paths under them are path-style.
 * Anything else with a `*.<one of these>` shape is virtual-hosted.
 *
 * For now we only recognize localhost-shaped origins; production hosts
 * will be added via env when we deploy.
 */
const PLATFORM_SUFFIXES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

export function parseUrlStyle(host: string, path: string): UrlStyleResult {
  // Strip an optional port.
  const hostNoPort = host.split(":")[0]!.toLowerCase();
  const cleanPath = path === "" ? "/" : path;

  // Virtual-hosted: `<bucket>.<platformSuffix>` where platformSuffix is
  // any host we serve from. For hackathon we don't expose virtual-hosted
  // at all; any host that doesn't start with a platform-suffix label is
  // assumed path-style.
  for (const suffix of PLATFORM_SUFFIXES) {
    if (hostNoPort === suffix) break; // path-style — not virtual-hosted
    if (hostNoPort.endsWith("." + suffix)) {
      const bucket = hostNoPort.slice(0, -("." + suffix).length);
      if (bucket.length === 0) break;
      const key = trimLeadingSlash(cleanPath);
      return key.length === 0 ? { bucket } : { bucket, key };
    }
  }

  // Path-style. The first path segment is the bucket; the rest is the key.
  if (cleanPath === "/" || cleanPath === "") return {};
  const stripped = trimLeadingSlash(cleanPath);
  const slash = stripped.indexOf("/");
  if (slash === -1) {
    return { bucket: stripped };
  }
  const bucket = stripped.slice(0, slash);
  const key = stripped.slice(slash + 1);
  return key.length === 0 ? { bucket } : { bucket, key: decodeURIComponent(key) };
}

function trimLeadingSlash(s: string): string {
  return s.startsWith("/") ? s.slice(1) : s;
}
