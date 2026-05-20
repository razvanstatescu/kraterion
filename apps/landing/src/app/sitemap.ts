import type { MetadataRoute } from "next";

const SITE = "https://kraterion.com";

const PATHS = [
  "/",
  "/s3",
  "/knowledge",
  "/embed",
  "/pricing",
  "/security",
  "/docs",
  "/docs/quickstart",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PATHS.map((p) => ({
    url: `${SITE}${p === "/" ? "" : p}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: p === "/" ? 1 : 0.7,
  }));
}
