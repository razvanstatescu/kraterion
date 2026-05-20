import { Search, List, FileText, Pencil, FileStack, type LucideIcon } from "lucide-react";
import { FadeUp } from "@/components/motion/FadeUp";

const TOOLS: { icon: LucideIcon; name: string; sig: string }[] = [
  { icon: Search, name: "search", sig: "search(query)" },
  { icon: List, name: "list", sig: "list(prefix)" },
  { icon: FileText, name: "read", sig: "read(key)" },
  { icon: Pencil, name: "write", sig: "write(key, content)" },
  { icon: FileStack, name: "manifest", sig: "manifest(answerId)" },
];

export function AgentTools() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {TOOLS.map((t, i) => (
        <FadeUp key={t.name} delay={i * 0.04}>
          <div className="flex h-full flex-col gap-3 rounded-lg border border-stone-200/60 bg-cream p-5">
            <t.icon size={20} strokeWidth={1.5} className="text-ink" />
            <div className="text-[15px] font-medium text-ink">{t.name}</div>
            <code className="text-[12px] text-stone-600">{t.sig}</code>
          </div>
        </FadeUp>
      ))}
    </div>
  );
}
