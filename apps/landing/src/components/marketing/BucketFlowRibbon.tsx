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
  { name: "pricing-faq.md", size: "12 KB" },
  { name: "product-overview.pdf", size: "482 KB" },
  { name: "release-notes-2026-05.md", size: "8 KB" },
  { name: "onboarding-guide.pdf", size: "1.2 MB" },
];

const CHUNKS = 12;

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
        end: "+=140%",
        pin: true,
        scrub: 0.5,
        onUpdate: (self) => setProgress(self.progress),
      });
      return () => trigger.kill();
    },
    { scope: containerRef, dependencies: [reduceMotion] }
  );

  const activeStage = progress < 0.33 ? 0 : progress < 0.66 ? 1 : 2;

  return (
    <div ref={containerRef} className="relative h-screen w-full overflow-hidden bg-ink">
      {/* Top eyebrow band — anchors the top of the pinned section */}
      <div className="absolute inset-x-0 top-0 z-10 border-b border-stone-800/60 bg-ink/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-6 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
            Pipeline · bucket → indexed → answer
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500 md:inline">
            {activeStage === 0 ? "files" : activeStage === 1 ? "chunks" : "citations"}
          </span>
        </div>
      </div>

      <div className="mx-auto grid h-full max-w-[1280px] grid-cols-1 items-stretch gap-4 px-6 pt-24 pb-24 md:grid-cols-3 md:gap-5">
        {/* Stage 1 — bucket files */}
        <Stage
          n="01"
          icon={File}
          label="Bucket"
          detail="Your S3 keys."
          active={activeStage === 0}
          meta="4 files · 1.7 MB"
        >
          <ul className="space-y-1.5">
            {FILES.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between rounded-sm border border-stone-700/70 bg-stone-900/50 px-2.5 py-1.5 text-[11px]"
              >
                <span className="flex items-center gap-2 truncate font-mono text-stone-300">
                  <File size={10} strokeWidth={1.5} className="text-stone-500" />
                  {f.name}
                </span>
                <span className="font-mono tabular-nums text-stone-500">{f.size}</span>
              </li>
            ))}
          </ul>
        </Stage>

        {/* Stage 2 — chunks */}
        <Stage
          n="02"
          icon={Boxes}
          label="Indexed knowledge"
          detail="BM25 + dense vectors."
          active={activeStage === 1}
          meta="48 chunks · 1,536 dims"
        >
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: CHUNKS }).map((_, i) => {
              const isHot = i % 5 === 0 && activeStage === 1;
              return (
                <div
                  key={i}
                  className={cn(
                    "aspect-square rounded-sm transition-colors duration-500",
                    isHot ? "bg-krater/80" : "bg-krater/25"
                  )}
                />
              );
            })}
          </div>
          <ul className="mt-3 space-y-1 font-mono text-[10px] text-stone-500">
            <li className="flex justify-between">
              <span>top-k</span>
              <span className="text-stone-300">8 → rerank to 4</span>
            </li>
            <li className="flex justify-between">
              <span>encoder</span>
              <span className="text-stone-300">bge-m3 · multilingual</span>
            </li>
          </ul>
        </Stage>

        {/* Stage 3 — answer card */}
        <Stage
          n="03"
          icon={MessageSquare}
          label="Answer + citation"
          detail="Reranked, citation-bound."
          active={activeStage === 2}
          meta="0.92 · verified"
        >
          <div className="rounded-md border border-stone-700/70 bg-stone-900/60 p-3 text-[12px] text-stone-200">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-stone-500">
              <span className="h-1 w-1 rounded-full bg-[color:var(--color-success)]" />
              answer
            </div>
            <p className="mt-2 leading-[1.5]">
              Refunds are processed within 7 business days from the original payment method.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-krater/40 bg-krater/10 px-1.5 py-0.5 font-mono text-[10px] text-krater">
                pricing-faq.md · §3
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-stone-700 bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">
                0.92
              </span>
            </div>
          </div>
        </Stage>
      </div>

      {/* Bottom progress + stage label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
          stage {String(activeStage + 1).padStart(2, "0")} / 03
        </div>
        <div className="h-px w-[200px] bg-stone-700">
          <div
            className="h-full bg-krater transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Stage({
  n,
  icon: Icon,
  label,
  detail,
  children,
  active,
  meta,
}: {
  n: string;
  icon: typeof File;
  label: string;
  detail: string;
  children: React.ReactNode;
  active: boolean;
  meta: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full max-h-[70vh] min-h-[420px] flex-col rounded-lg border bg-stone-900/40 p-6",
        "transition-all duration-500",
        active
          ? "border-krater/40 opacity-100 shadow-[0_0_0_1px_rgba(196,91,54,0.18)]"
          : "border-stone-800 opacity-50"
      )}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] tabular-nums text-krater">{n}</span>
          <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
            {label}
          </span>
        </div>
        <span className="font-mono text-[10px] text-stone-500">{meta}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Icon size={14} strokeWidth={1.5} className="text-cream" />
        <span className="text-[14px] font-medium text-cream">{label}</span>
      </div>
      <div className="text-[11px] text-stone-400">{detail}</div>
      <div className="mt-6 flex-1">{children}</div>
    </div>
  );
}
