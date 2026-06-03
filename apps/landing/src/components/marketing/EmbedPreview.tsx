import { cn } from "@/lib/cn";
import { KraterionChatWidget } from "./KraterionChatWidget";

/**
 * EmbedPreview — a faux customer page hinted at with a few light skeleton bars,
 * with the live Kraterion chat widget floating in the bottom-right corner.
 * The page is deliberately understated: just enough to read as "someone's site"
 * so the widget is the thing you look at.
 *
 * Skeletons are static and faint (no shimmer) — the autoplaying chat is the only
 * motion and the only Krater accent. Hairline-only, no shadows.
 */

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-sm bg-stone-200/50", className)} aria-hidden />
  );
}

export function EmbedPreview({ className }: { className?: string }) {
  return (
    <div className={cn("relative isolate min-h-[500px]", className)}>
      {/* Abstract page — a few faint blocks, no chrome */}
      <div className="px-10 py-12">
        <div className="space-y-3.5">
          <Bar className="h-4 w-2/5" />
          <Bar className="h-2 w-[58%] bg-stone-200/40" />
          <Bar className="h-2 w-[46%] bg-stone-200/40" />
        </div>
        <Bar className="mt-10 h-28 w-full bg-stone-200/35" />
        <div className="mt-8 space-y-2.5">
          <Bar className="h-2 w-[52%] bg-stone-200/40" />
          <Bar className="h-2 w-[40%] bg-stone-200/40" />
        </div>
      </div>

      {/* The live widget, sitting where it would on a real page */}
      <div className="absolute bottom-5 right-5 z-10 w-[320px]">
        <KraterionChatWidget
          mode="demo"
          greeting="Hi — ask me anything about our docs."
        />
      </div>
    </div>
  );
}
