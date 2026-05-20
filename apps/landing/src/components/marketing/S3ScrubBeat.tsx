"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlockClient } from "@/components/ui/CodeBlockClient";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

type Tab = { lang: string; filename: string; code: string; html: string };

export function S3ScrubBeat({ tabs }: { tabs: Tab[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
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
      if (!ref.current || reduceMotion) return;
      const trigger = ScrollTrigger.create({
        trigger: ref.current,
        start: "top top",
        end: "+=120%",
        pin: true,
        scrub: 0.4,
        onUpdate: (self) => {
          const p = self.progress;
          // 4 tabs → 4 segments
          const idx = Math.min(tabs.length - 1, Math.floor(p * tabs.length));
          setActive(idx);
        },
      });
      return () => trigger.kill();
    },
    { scope: ref, dependencies: [reduceMotion, tabs.length] }
  );

  return (
    <section ref={ref} className="bg-stone-50">
      <div className="mx-auto grid h-full max-w-[1280px] grid-cols-1 items-center gap-12 px-6 py-24 md:grid-cols-2 md:gap-16 md:py-32">
        <div className="flex flex-col justify-center">
          <FadeUp>
            <p className="micro text-stone-500">S3 compatibility</p>
            <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
              It speaks S3 — really.
            </h2>
            <ul className="mt-8 flex flex-col gap-3 text-[16px] text-stone-700">
              <li className="flex gap-3">
                <span aria-hidden className="mt-3 h-px w-4 shrink-0 bg-stone-400" />
                Point your boto3 client at us.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-3 h-px w-4 shrink-0 bg-stone-400" />
                rclone, aws-cli, MinIO Client work today.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-3 h-px w-4 shrink-0 bg-stone-400" />
                Multipart, presigned URLs, lifecycle rules, server-side encryption.
              </li>
            </ul>
            <p className="mt-6 text-[13px] text-stone-500">
              {reduceMotion
                ? "Tap a tab to switch SDK."
                : "Scroll to step through SDKs."}
            </p>
          </FadeUp>
        </div>
        <FadeUp delay={0.1}>
          <div className="overflow-hidden rounded-lg border border-stone-200/60 bg-stone-50">
            <CodeBlockClient
              tabs={tabs}
              copy
              tone="cream"
              controlledActive={active}
              onActiveChange={setActive}
            />
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
