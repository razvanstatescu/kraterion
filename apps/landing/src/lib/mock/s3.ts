export const REGIONS = [
  { region: "eu-central-1", endpoint: "https://s3.eu-central-1.kraterion.com", status: "operational" },
  { region: "us-east-1", endpoint: "https://s3.us-east-1.kraterion.com", status: "operational" },
  { region: "ap-southeast-1", endpoint: "https://s3.ap-southeast-1.kraterion.com", status: "operational" },
  { region: "auto (global)", endpoint: "https://s3.kraterion.com", status: "operational" },
] as const;

export type Support = "full" | "partial" | "roadmap";

export const COMPAT: { feature: string; support: Support; note?: string }[] = [
  { feature: "PutObject / GetObject / DeleteObject", support: "full" },
  { feature: "ListObjectsV2", support: "full" },
  { feature: "Multipart uploads", support: "full" },
  { feature: "Presigned URLs (V4)", support: "full" },
  { feature: "Server-side encryption (SSE-S3, SSE-KMS)", support: "full" },
  { feature: "Lifecycle rules", support: "full" },
  { feature: "Bucket versioning", support: "partial", note: "Reads supported; full mutation API on roadmap" },
  { feature: "Object Lock (compliance mode)", support: "partial", note: "Governance mode supported" },
  { feature: "S3 Select", support: "roadmap" },
  { feature: "CORS configuration", support: "full" },
  { feature: "Bucket policies (IAM-compatible)", support: "full" },
  { feature: "Replication", support: "roadmap" },
];
