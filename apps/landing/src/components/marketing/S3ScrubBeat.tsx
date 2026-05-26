"use client";

import { useState } from "react";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlockClient } from "@/components/ui/CodeBlockClient";

type Tab = { lang: string; filename: string; code: string; html: string };

/**
 * S3 compatibility beat — a static, normal-flow section with manual tabs.
 * (The previous scroll-pinned scrub timeline was removed; readers prefer
 * to click through SDKs at their own pace.)
 */
export function S3ScrubBeat({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);

  return (
    <section className="bg-stone-50">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 py-24 md:grid-cols-2 md:gap-16 md:py-32">
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
                rclone, aws-cli, and the AWS SDKs all work today.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-3 h-px w-4 shrink-0 bg-stone-400" />
                Presigned URLs, public-read buckets, always-on AES256 at rest.
              </li>
            </ul>
            <p className="mt-6 text-[13px] text-stone-500">
              Tap a tab to switch SDK.
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
