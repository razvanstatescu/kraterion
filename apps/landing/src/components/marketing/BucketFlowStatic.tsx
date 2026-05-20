import { FadeUp } from "@/components/motion/FadeUp";
import { File, Boxes, MessageSquare, ArrowRight } from "lucide-react";

const STAGES = [
  {
    icon: File,
    label: "Bucket",
    detail: "File rows, S3 keys, your bytes.",
  },
  {
    icon: Boxes,
    label: "Indexed knowledge",
    detail: "Chunked + embedded. BM25 + dense vector.",
  },
  {
    icon: MessageSquare,
    label: "Answer + citation",
    detail: "Top-k retrieval, reranked, citation-bound.",
  },
];

export function BucketFlowStatic() {
  return (
    <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-2">
      {STAGES.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-center gap-2">
          <FadeUp delay={i * 0.08} className="flex-1">
            <div className="rounded-lg border border-stone-800 bg-stone-900/40 p-6">
              <s.icon size={20} strokeWidth={1.5} className="text-cream" />
              <div className="mt-4 text-[18px] font-medium text-cream">{s.label}</div>
              <div className="mt-1 text-[13px] text-stone-400">{s.detail}</div>
            </div>
          </FadeUp>
          {i < STAGES.length - 1 && (
            <ArrowRight
              size={16}
              strokeWidth={1.5}
              className="hidden text-stone-500 md:block"
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}
