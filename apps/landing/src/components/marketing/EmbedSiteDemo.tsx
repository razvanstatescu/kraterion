"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { KraterionChatWidget } from "./KraterionChatWidget";

type Theme = "light" | "dark";
type Position = "bottom-right" | "bottom-left";

export function EmbedSiteDemo() {
  const [theme, setTheme] = useState<Theme>("light");
  const [position, setPosition] = useState<Position>("bottom-right");

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-stone-200/60 bg-cream px-4 py-3">
        <Group label="Theme">
          <Pill active={theme === "light"} onClick={() => setTheme("light")}>
            Light
          </Pill>
          <Pill active={theme === "dark"} onClick={() => setTheme("dark")}>
            Dark
          </Pill>
        </Group>
        <Group label="Position">
          <Pill
            active={position === "bottom-right"}
            onClick={() => setPosition("bottom-right")}
          >
            Bottom-right
          </Pill>
          <Pill
            active={position === "bottom-left"}
            onClick={() => setPosition("bottom-left")}
          >
            Bottom-left
          </Pill>
        </Group>
        <Group label="Live preview">
          <span className="inline-flex items-center gap-2 text-[12px] text-stone-600">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)] animate-[pulse_1.6s_ease-in-out_infinite]" />
            running
          </span>
        </Group>
      </div>

      {/* Fake site frame */}
      <div className="relative overflow-hidden rounded-lg border border-stone-200/60 bg-stone-50">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 border-b border-stone-200/60 bg-cream px-3 py-2.5">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-full bg-stone-300" />
            ))}
          </div>
          <div className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-stone-200/60 bg-stone-50 px-3 py-1 font-mono text-[11px]">
            <span className="text-stone-400">https://</span>
            <span className="text-ink">acme-co.com</span>
            <span className="text-stone-400">/docs</span>
          </div>
        </div>

        {/* Fake page content */}
        <div className="relative min-h-[600px] overflow-hidden bg-stone-50 px-8 py-10 md:px-14 md:py-14">
          <div className="mx-auto max-w-[640px]">
            <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
              Acme docs
            </div>
            <h3 className="mt-2 text-[28px] leading-[1.2] text-ink">
              Getting started with the Acme API.
            </h3>
            <p className="mt-4 text-[14px] leading-[1.7] text-stone-600">
              Welcome to Acme. This guide walks you through authenticating, making your first request, and handling rate-limited responses gracefully. Pick a language tab below.
            </p>
            <div className="mt-6 space-y-2">
              <div className="h-3 w-full rounded-sm bg-stone-200/60" />
              <div className="h-3 w-[88%] rounded-sm bg-stone-200/60" />
              <div className="h-3 w-[72%] rounded-sm bg-stone-200/60" />
            </div>
            <div className="mt-8 rounded-md border border-stone-200/60 bg-cream p-4 font-mono text-[12px] text-stone-700">
              <div className="text-stone-400">// authenticate</div>
              <div>
                <span className="text-stone-700">const</span>{" "}
                <span className="text-krater">client</span> = new Acme(API_KEY);
              </div>
            </div>
          </div>

          {/* Embedded widget */}
          <div
            className={cn(
              "absolute bottom-6 transition-[left,right] duration-300",
              position === "bottom-right" ? "right-6" : "left-6"
            )}
          >
            <KraterionChatWidget mode="demo" theme={theme} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm px-2 py-1 text-[12px] font-medium transition-colors",
        active
          ? "bg-ink text-cream"
          : "bg-stone-100 text-stone-700 hover:bg-stone-200"
      )}
    >
      {children}
    </button>
  );
}
