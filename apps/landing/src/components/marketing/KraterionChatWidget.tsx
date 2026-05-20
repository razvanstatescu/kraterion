"use client";

import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import * as motion from "motion/react-client";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";

type Msg = { role: "user" | "assistant"; text: string; citation?: string };

const DEMO_SCRIPT: Msg[] = [
  { role: "user", text: "What is your refund policy?" },
  {
    role: "assistant",
    text: "Refunds are processed within 7 business days from the original payment method. Annual plans are pro-rated.",
    citation: "pricing-faq.md · §3",
  },
  { role: "user", text: "Do you support custom regions?" },
  {
    role: "assistant",
    text: "Scale plans include custom regions on request. We deploy a regional cluster within 5 business days.",
    citation: "deployment-guide.md · §4.2",
  },
];

export function KraterionChatWidget({
  mode = "demo",
  theme = "light",
  greeting = "Hi — ask me anything about Kraterion.",
  className,
}: {
  mode?: "live" | "demo";
  theme?: "light" | "dark";
  greeting?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: greeting },
  ]);
  const [scriptIndex, setScriptIndex] = useState(0);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // demo autoplay
  useEffect(() => {
    if (mode !== "demo") return;
    if (scriptIndex >= DEMO_SCRIPT.length) return;
    const t = window.setTimeout(() => {
      const next = DEMO_SCRIPT[scriptIndex];
      if (next.role === "user") {
        setMessages((m) => [...m, next]);
        setScriptIndex((i) => i + 1);
      } else {
        setTyping(true);
        const t2 = window.setTimeout(() => {
          setTyping(false);
          setMessages((m) => [...m, next]);
          setScriptIndex((i) => i + 1);
        }, 900);
        return () => window.clearTimeout(t2);
      }
    }, 1400);
    return () => window.clearTimeout(t);
  }, [mode, scriptIndex]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, typing]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: "user", text: input.trim() }]);
    setInput("");
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "I'd pull this from your bucket in a real deployment. Connect a bucket to enable real answers.",
          citation: "demo · live mode disabled",
        },
      ]);
    }, 900);
  };

  const isDark = theme === "dark";

  return (
    <div className={cn("flex flex-col", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "flex h-[480px] w-[360px] flex-col overflow-hidden rounded-lg border",
              isDark
                ? "border-stone-800 bg-stone-900 text-cream"
                : "border-stone-200/60 bg-cream text-ink"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between border-b px-4 py-3",
                isDark ? "border-stone-800" : "border-stone-200/60"
              )}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-krater" />
                <span className="text-[13px] font-medium">Support</span>
              </div>
              <span className={cn("text-[11px]", isDark ? "text-stone-400" : "text-stone-500")}>
                powered by Kraterion
              </span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, i) => (
                <Bubble key={i} msg={m} dark={isDark} />
              ))}
              {typing && <TypingDots dark={isDark} />}
            </div>
            <form
              onSubmit={onSubmit}
              className={cn(
                "flex items-center gap-2 border-t px-3 py-2.5",
                isDark ? "border-stone-800" : "border-stone-200/60"
              )}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question…"
                className={cn(
                  "flex-1 bg-transparent text-[14px] outline-none",
                  isDark ? "text-cream placeholder:text-stone-500" : "text-ink placeholder:text-stone-500"
                )}
                aria-label="Message"
              />
              <button
                type="submit"
                aria-label="Send"
                className="grid h-8 w-8 place-items-center rounded-sm bg-krater text-cream hover:opacity-90"
              >
                <Send size={14} strokeWidth={1.75} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        className={cn(
          "ml-auto mt-3 grid h-12 w-12 place-items-center rounded-full",
          "bg-krater text-cream hover:opacity-90"
        )}
      >
        <MessageSquare size={20} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function Bubble({ msg, dark }: { msg: Msg; dark: boolean }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-[13px] leading-[1.5]",
            isUser
              ? "bg-krater text-cream"
              : dark
              ? "bg-stone-800 text-stone-200"
              : "bg-stone-100 text-ink"
          )}
        >
          {msg.text}
        </div>
        {msg.citation && (
          <div
            className={cn(
              "mt-1.5 inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]",
              "border border-krater/40 bg-krater/10 text-krater"
            )}
          >
            src · {msg.citation}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TypingDots({ dark }: { dark: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn("h-1.5 w-1.5 rounded-full", dark ? "bg-stone-500" : "bg-stone-400")}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
