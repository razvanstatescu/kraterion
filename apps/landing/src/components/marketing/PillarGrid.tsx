"use client";

import { Boxes, Search, Bot, MessageSquare, type LucideIcon } from "lucide-react";
import * as motion from "motion/react-client";
import { cn } from "@/lib/cn";

const PILLARS: {
  icon: LucideIcon;
  title: string;
  lede: string;
  bullets: string[];
}[] = [
  {
    icon: Boxes,
    title: "S3-compatible object storage",
    lede: "boto3, aws-cli, rclone, JS SDK — all work today.",
    bullets: ["Multipart uploads", "Presigned URLs", "Server-side encryption"],
  },
  {
    icon: Search,
    title: "Knowledge layer",
    lede: "Flip a switch on a bucket. Every file becomes searchable.",
    bullets: ["BM25 + dense vector", "Citation-bound", "Hybrid retrieval"],
  },
  {
    icon: Bot,
    title: "Agents",
    lede: "OpenAI-compatible endpoints. Tools, citations, answers.",
    bullets: ["Drop-in OpenAI client", "5 built-in tools", "Per-agent quotas"],
  },
  {
    icon: MessageSquare,
    title: "Embed widget",
    lede: "One script tag. Origin-locked share tokens.",
    bullets: ["Theme + position", "Per-token rate limits", "No iframe required"],
  },
];

export function PillarGrid() {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
      {PILLARS.map((p) => (
        <Pillar key={p.title} {...p} />
      ))}
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  lede,
  bullets,
}: {
  icon: LucideIcon;
  title: string;
  lede: string;
  bullets: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
      whileHover="hover"
      className={cn("group bg-cream p-8 md:p-10")}
    >
      <motion.div
        variants={{ hover: { rotate: 8 } }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
        className="inline-flex"
      >
        <Icon size={24} strokeWidth={1.5} className="text-ink" />
      </motion.div>
      <h3 className="mt-4 text-[24px] leading-[1.2] text-ink">{title}</h3>
      <p className="mt-3 text-[16px] text-stone-700">{lede}</p>
      <ul className="mt-6 flex flex-col gap-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-[14px] text-stone-600">
            <span aria-hidden className="h-px w-3 bg-stone-400" />
            {b}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
