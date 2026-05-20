"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { File, Boxes, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

const FILES = [
  "product-overview.pdf",
  "release-notes.md",
  "onboarding.pdf",
  "pricing-faq.md",
];

const CHUNKS = Array.from({ length: 12 });

export function BucketFlowRibbon() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const on = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useGSAP(
    () => {
      if (!containerRef.current || reduceMotion) return;
      const trigger = ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top top",
        end: "+=120%",
        pin: true,
        scrub: 0.5,
        onUpdate: (self) => setProgress(self.progress),
      });
      return () => trigger.kill();
    },
    { scope: containerRef, dependencies: [reduceMotion] }
  );

  // Stage 0–0.33: fill files; 0.33–0.66: emit chunks; 0.66–1: collapse to answer
  const filesProgress = Math.max(0, Math.min(1, progress / 0.33));
  const chunkProgress = Math.max(0, Math.min(1, (progress - 0.33) / 0.33));
  const answerProgress = Math.max(0, Math.min(1, (progress - 0.66) / 0.34));

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full"
    >
      <div className="mx-auto grid h-full max-w-[1280px] grid-cols-1 items-center gap-8 px-6 md:grid-cols-3">
        {/* Stage 1 — files filling */}
        <Stage
          icon={File}
          label="Bucket"
          detail="Your S3 keys, your bytes."
          dim={chunkProgress > 0.6}
        >
          <ul className="space-y-2">
            {FILES.map((name, i) => {
              const lineProg = Math.max(
                0,
                Math.min(1, (filesProgress - i / FILES.length) * FILES.length)
              );
              return (
                <li
                  key={name}
                  className="flex items-center justify-between rounded-sm border border-stone-700 px-3 py-2 text-[12px] text-stone-300"
                  style={{
                    opacity: lineProg,
                    transform: `translateY(${(1 - lineProg) * 8}px)`,
                  }}
                >
                  <span className="font-mono">{name}</span>
                  <span className="text-stone-500">{(Math.random() * 400 + 80).toFixed(0)} KB</span>
                </li>
              );
            })}
          </ul>
        </Stage>

        {/* Stage 2 — chunks emerging */}
        <Stage
          icon={Boxes}
          label="Indexed knowledge"
          detail="Chunked, embedded, ready to retrieve."
          dim={answerProgress > 0.4}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {CHUNKS.map((_, i) => {
              const chunkOffset = i / CHUNKS.length;
              const cp = Math.max(0, Math.min(1, (chunkProgress - chunkOffset * 0.4) / 0.6));
              return (
                <div
                  key={i}
                  className="aspect-square rounded-sm bg-krater/70"
                  style={{ opacity: cp, transform: `scale(${0.6 + 0.4 * cp})` }}
                />
              );
            })}
          </div>
        </Stage>

        {/* Stage 3 — answer card */}
        <Stage
          icon={MessageSquare}
          label="Answer + citation"
          detail="Top-k retrieval, reranked, citation-bound."
        >
          <div
            className="rounded-lg border border-stone-700 bg-stone-900/40 p-4 text-[13px] text-stone-200"
            style={{
              opacity: answerProgress,
              transform: `translateY(${(1 - answerProgress) * 16}px)`,
            }}
          >
            <p>
              Refunds are processed within 7 business days from the original payment method.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-sm border border-krater/60 bg-krater/10 px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-krater">
              <span>src</span>
              <span className="font-mono normal-case tracking-normal">pricing-faq.md · §3</span>
            </div>
          </div>
        </Stage>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-8 mx-auto h-px w-[200px] bg-stone-700"
      >
        <div
          className="h-full bg-krater transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

function Stage({
  icon: Icon,
  label,
  detail,
  children,
  dim = false,
}: {
  icon: typeof File;
  label: string;
  detail: string;
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-stone-800 bg-stone-900/40 p-6",
        "transition-opacity duration-300",
        dim ? "opacity-60" : "opacity-100"
      )}
    >
      <Icon size={20} strokeWidth={1.5} className="text-cream" />
      <div className="mt-3 text-[16px] font-medium text-cream">{label}</div>
      <div className="text-[12px] text-stone-400">{detail}</div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
