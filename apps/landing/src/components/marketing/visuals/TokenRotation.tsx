import { cn } from "@/lib/cn";
import { ArrowRight } from "lucide-react";

export function TokenRotation({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Token rotation · zero-downtime
        </span>
        <span className="font-mono text-[11px] text-stone-600">2026-05-20 14:02</span>
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 py-8 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
        {/* Old token */}
        <div className="rounded-md border border-stone-200/60 bg-stone-50 p-4 opacity-60">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-stone-700 line-through">
              pk_share_3f4d…01ab
            </span>
            <span className="rounded-sm bg-stone-200 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] font-medium text-stone-600">
              revoking
            </span>
          </div>
          <dl className="mt-3 space-y-1 text-[11px] text-stone-600">
            <div className="flex justify-between"><dt>Issued</dt><dd className="font-mono">2025-08-12</dd></div>
            <div className="flex justify-between"><dt>Last used</dt><dd className="font-mono">3 hours ago</dd></div>
            <div className="flex justify-between"><dt>Calls (30d)</dt><dd className="font-mono">182,402</dd></div>
          </dl>
          {/* Fade-out bar */}
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-stone-200/60">
            <div className="h-full w-[20%] bg-stone-500" />
          </div>
        </div>

        <div className="hidden md:flex justify-center">
          <ArrowRight size={20} strokeWidth={1.5} className="text-stone-500" />
        </div>

        {/* New token */}
        <div className="rounded-md border border-krater/40 bg-krater/[0.04] p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] text-ink">
              pk_share_92a1…7e4d
            </span>
            <span className="rounded-sm bg-krater px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] font-medium text-cream">
              active
            </span>
          </div>
          <dl className="mt-3 space-y-1 text-[11px] text-stone-700">
            <div className="flex justify-between"><dt>Issued</dt><dd className="font-mono">just now</dd></div>
            <div className="flex justify-between"><dt>Last used</dt><dd className="font-mono">3 min ago</dd></div>
            <div className="flex justify-between"><dt>Calls (30d)</dt><dd className="font-mono">412</dd></div>
          </dl>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-stone-200/60">
            <div className="h-full w-full bg-krater" />
          </div>
        </div>
      </div>
      <div className="border-t border-stone-200/60 bg-stone-50 px-4 py-2.5 font-mono text-[11px] text-stone-600">
        ✓ no redeploy required · old token serves cached traffic for 5 min, then 401
      </div>
    </div>
  );
}
