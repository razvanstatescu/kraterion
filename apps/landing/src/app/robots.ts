import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://kraterion.com/sitemap.xml",
    host: "https://kraterion.com",
  };
}
