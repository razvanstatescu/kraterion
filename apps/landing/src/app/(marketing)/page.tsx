import type { Metadata } from "next";
import { Landing } from "@/components/marketing/Landing";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "A runtime for agents you can audit — Kraterion",
  description:
    "Run any agent and record every run as a tamper-evident, replayable trail. Debug, reproduce, and audit your agents — built on object storage you own.",
};

export default function Page() {
  return <Landing />;
}
