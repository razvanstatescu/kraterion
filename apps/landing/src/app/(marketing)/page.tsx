import type { Metadata } from "next";
import { Landing } from "@/components/marketing/Landing";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Object storage you actually own — Kraterion",
  description:
    "One bucket. S3-compatible. Searchable. Agent-ready. Embeddable. Bring the tools you already use; leave whenever you want.",
};

export default function Page() {
  return <Landing />;
}
