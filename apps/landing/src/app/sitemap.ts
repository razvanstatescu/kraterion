import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://kraterion.com",
      lastModified: new Date(),
      changeFrequency: "weekly",
    },
  ];
}
