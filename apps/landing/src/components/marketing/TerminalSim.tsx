"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type TerminalLine = {
  kind: "prompt" | "output" | "success";
  text: string;
};

const HELP = `kraterion help — commands
  aws s3 ls                   list buckets
  aws s3 ls s3://my-bucket    list files in a bucket
  kraterion agents list       list agents
  help                        show this help`;

const RESOLVERS: Array<[RegExp, string]> = [
  [/^aws s3 ls$/, "2026-05-18 14:02:11 my-bucket"],
  [/^aws s3 ls s3:\/\/my-bucket/, "2026-05-18 14:02:14    482991 photo.jpg"],
  [/^kraterion agents list$/, "support-agent     ready    1 bucket    0 calls today"],
  [/^help$/, HELP],
];

function defaultResolver(input: string): string {
  for (const [re, out] of RESOLVERS) if (re.test(input)) return out;
  return `kraterion: try 'help' or 'aws s3 ls'`;
}

export function TerminalSim({
  lines,
  interactive = false,
  className,
}: {
  lines: TerminalLine[];
  interactive?: boolean;
  className?: string;
}) {
  const [history, setHistory] = useState<TerminalLine[]>([]);
  const [typedIndex, setTypedIndex] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Type-on-view autoplay
  useEffect(() => {
    if (startedRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !startedRef.current) {
          startedRef.current = true;
          setRunning(true);
        }
      },
      { threshold: 0.4 }
    );
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    if (typedIndex >= lines.length) return;
    const line = lines[typedIndex];
    if (line.kind === "prompt") {
      if (typedChars < line.text.length) {
        const t = window.setTimeout(() => setTypedChars((c) => c + 1), 38);
        return () => window.clearTimeout(t);
      }
      // commit and advance
      const t = window.setTimeout(() => {
        setHistory((h) => [...h, line]);
        setTypedIndex((i) => i + 1);
        setTypedChars(0);
      }, 120);
      return () => window.clearTimeout(t);
    }
    // output / success lines appear instantly with a short delay
    const t = window.setTimeout(() => {
      setHistory((h) => [...h, line]);
      setTypedIndex((i) => i + 1);
    }, 120);
    return () => window.clearTimeout(t);
  }, [running, typedIndex, typedChars, lines]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setHistory((h) => [
      ...h,
      { kind: "prompt", text: input },
      { kind: "output", text: defaultResolver(input.trim()) },
    ]);
    setInput("");
  };

  const stillTyping =
    typedIndex < lines.length && lines[typedIndex].kind === "prompt";

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-lg border border-stone-800 bg-stone-900 text-cream",
        "font-mono text-[13px] leading-[1.65]",
        "overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-stone-800 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-stone-700" />
        <span className="h-2 w-2 rounded-full bg-stone-700" />
        <span className="h-2 w-2 rounded-full bg-stone-700" />
        <span className="ml-2 text-[11px] uppercase tracking-[0.16em] text-stone-400">
          terminal
        </span>
      </div>
      <div
        className="px-4 py-4 min-h-[280px]"
        role="log"
        aria-live="polite"
        aria-label="Simulated terminal"
      >
        {history.map((l, i) => (
          <Line key={i} line={l} />
        ))}
        {stillTyping && (
          <div>
            <span className="text-stone-400">$ </span>
            <span>{lines[typedIndex].text.slice(0, typedChars)}</span>
            <span className="ml-px inline-block w-[7px] bg-cream/80 align-baseline [animation:cursor-blink_1s_step-end_infinite]">
              &nbsp;
            </span>
          </div>
        )}
        {interactive && !stillTyping && typedIndex >= lines.length && (
          <form onSubmit={onSubmit}>
            <label className="flex items-center gap-1">
              <span className="text-stone-400">$</span>
              <input
                aria-label="Terminal input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 bg-transparent text-cream outline-none placeholder:text-stone-600"
                placeholder="try 'aws s3 ls' or 'help'"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
          </form>
        )}
      </div>
      <style>{`@keyframes cursor-blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

function Line({ line }: { line: TerminalLine }) {
  if (line.kind === "prompt") {
    return (
      <div>
        <span className="text-stone-400">$ </span>
        <span>{line.text}</span>
      </div>
    );
  }
  if (line.kind === "success") {
    return <div className="text-[color:var(--color-success)]">{line.text}</div>;
  }
  return <div className="text-stone-300 whitespace-pre">{line.text}</div>;
}
