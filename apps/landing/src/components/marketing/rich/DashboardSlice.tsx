import { File, FolderOpen, Lock, Key, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "cream" | "ink";

export function DashboardChrome({
  url = "app.kraterion.com",
  path = "",
  tone = "cream",
  children,
  className,
}: {
  url?: string;
  path?: string;
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const dark = tone === "ink";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        dark ? "border-stone-800 bg-stone-900" : "border-stone-200/60 bg-cream",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b px-3 py-2.5",
          dark ? "border-stone-800 bg-stone-900/60" : "border-stone-200/60 bg-stone-50"
        )}
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                dark ? "bg-stone-700" : "bg-stone-300"
              )}
            />
          ))}
        </div>
        <div
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-sm px-3 py-1 font-mono text-[11px]",
            dark
              ? "border border-stone-800 bg-stone-900 text-stone-400"
              : "border border-stone-200/60 bg-cream text-stone-600"
          )}
        >
          <span className={dark ? "text-stone-500" : "text-stone-400"}>https://</span>
          <span className={dark ? "text-cream" : "text-ink"}>{url}</span>
          <span className={dark ? "text-stone-500" : "text-stone-400"}>{path}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

export function BucketRow({
  name,
  objects,
  size,
  access,
  created,
  highlight,
  tone = "cream",
}: {
  name: string;
  objects: string;
  size: string;
  access: string;
  created: string;
  highlight?: boolean;
  tone?: Tone;
}) {
  const dark = tone === "ink";
  return (
    <div
      className={cn(
        "grid grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] items-center gap-3 border-b px-4 py-3 text-[12px]",
        dark
          ? "border-stone-800 last:border-b-0"
          : "border-stone-200/60 last:border-b-0",
        highlight && (dark ? "bg-krater/[0.06]" : "bg-krater/[0.04]")
      )}
    >
      <div className="flex items-center gap-2 font-mono">
        {highlight ? (
          <span className="h-1.5 w-1.5 rounded-full bg-krater" aria-hidden />
        ) : (
          <span className={cn("h-1.5 w-1.5 rounded-full", dark ? "bg-stone-700" : "bg-stone-300")} aria-hidden />
        )}
        <span className={dark ? "text-cream" : "text-ink"}>{name}</span>
      </div>
      <span className={cn("font-mono tabular-nums", dark ? "text-stone-400" : "text-stone-600")}>
        {objects}
      </span>
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
          dark ? "bg-stone-800 text-stone-300" : "bg-stone-100 text-stone-700"
        )}
      >
        {size}
      </span>
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px]",
          dark ? "bg-stone-800 text-stone-300" : "bg-stone-100 text-stone-700"
        )}
      >
        {access}
      </span>
      <span className={cn("text-[11px]", dark ? "text-stone-500" : "text-stone-500")}>
        {created}
      </span>
    </div>
  );
}

const FILE_ICONS: Record<string, LucideIcon> = {
  file: File,
  folder: FolderOpen,
  lock: Lock,
  key: Key,
};

export function FileRow({
  icon = "file",
  name,
  size,
  status,
  tone = "cream",
}: {
  icon?: keyof typeof FILE_ICONS;
  name: string;
  size: string;
  status?: "uploading" | "encrypting" | "sealed" | "indexed";
  tone?: Tone;
}) {
  const dark = tone === "ink";
  const Icon = FILE_ICONS[icon];
  const statusConfig: Record<NonNullable<typeof status>, { label: string; color: string; pulse: boolean }> = {
    uploading: { label: "Uploading", color: "info", pulse: true },
    encrypting: { label: "Encrypting", color: "krater", pulse: true },
    sealed: { label: "Sealed", color: "success", pulse: false },
    indexed: { label: "Indexed", color: "success", pulse: false },
  };
  const s = status ? statusConfig[status] : null;
  const dotColorMap: Record<string, string> = {
    success: "#5C7A3F",
    info: "#3B6F73",
    krater: "#C45B36",
  };
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-4 py-3 text-[12px]",
        dark ? "border-stone-800 last:border-b-0" : "border-stone-200/60 last:border-b-0"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon
          size={14}
          strokeWidth={1.5}
          className={dark ? "text-stone-400" : "text-stone-500"}
        />
        <span
          className={cn(
            "truncate font-mono",
            dark ? "text-cream" : "text-ink"
          )}
        >
          {name}
        </span>
      </div>
      <span className={cn("font-mono tabular-nums", dark ? "text-stone-400" : "text-stone-600")}>
        {size}
      </span>
      {s && (
        <span className="inline-flex items-center gap-1.5 text-[11px]">
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 rounded-full", s.pulse && "animate-[pulse_1.6s_ease-in-out_infinite]")}
            style={{ background: dotColorMap[s.color] }}
          />
          <span className={dark ? "text-stone-400" : "text-stone-600"}>{s.label}</span>
        </span>
      )}
    </div>
  );
}

export function UsageBar({
  label,
  value,
  max,
  unit = "GB",
  tone = "cream",
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  tone?: Tone;
}) {
  const dark = tone === "ink";
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center justify-between text-[12px]">
        <span className={dark ? "text-stone-300" : "text-stone-700"}>{label}</span>
        <span className={cn("font-mono tabular-nums", dark ? "text-stone-400" : "text-stone-600")}>
          {value} / {max} {unit}
        </span>
      </div>
      <div className={cn("relative h-1 overflow-hidden rounded-full", dark ? "bg-stone-800" : "bg-stone-200/80")}>
        <div
          className="h-full bg-krater"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
