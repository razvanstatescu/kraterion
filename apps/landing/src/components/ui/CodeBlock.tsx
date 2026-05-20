import { highlight } from "@/lib/shiki";
import { cn } from "@/lib/cn";
import { CodeBlockClient } from "./CodeBlockClient";

export type CodeTab = {
  lang: string;
  filename: string;
  code: string;
};

export async function CodeBlock({
  tabs,
  className,
  copy = true,
  tone = "cream",
}: {
  tabs: CodeTab[];
  className?: string;
  copy?: boolean;
  tone?: "cream" | "ink";
}) {
  const highlighted = await Promise.all(
    tabs.map(async (t) => ({ ...t, html: await highlight(t.code, t.lang) }))
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        tone === "ink" ? "border-stone-800 bg-stone-900" : "border-stone-200/60 bg-stone-50",
        className
      )}
    >
      <CodeBlockClient tabs={highlighted} copy={copy} tone={tone} />
    </div>
  );
}
