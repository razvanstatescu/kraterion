"use client";

import { StateTransition } from "./rich/StateTransition";
import { Lock, Upload, Database, Key } from "lucide-react";

export function SealingFlow() {
  return (
    <StateTransition
      tone="ink"
      interval={2400}
      frames={[
        {
          label: "1 · Encrypt locally",
          node: (
            <div className="h-full bg-stone-900 p-6 md:p-8">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-400">
                On your device
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Lock size={24} strokeWidth={1.5} className="text-krater" />
                <span className="text-[20px] text-cream">photo.jpg</span>
              </div>
              <div className="mt-6 grid grid-cols-8 gap-1.5">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-sm"
                    style={{
                      background: i < 16 ? "rgba(196,91,54,0.7)" : "rgba(196,91,54,0.2)",
                    }}
                  />
                ))}
              </div>
              <div className="mt-6 font-mono text-[12px] text-stone-400">
                <span className="text-stone-500">$ </span>
                <span className="text-cream">kraterion seal photo.jpg</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-[color:var(--color-success)]">
                ✓ encrypted · 2.1 MB → 2.1 MB ciphertext
              </div>
            </div>
          ),
        },
        {
          label: "2 · Upload ciphertext",
          node: (
            <div className="h-full bg-stone-900 p-6 md:p-8">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-400">
                Network
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="rounded-md border border-stone-700 px-3 py-2 font-mono text-[11px] text-cream">
                  laptop
                </div>
                <div className="flex flex-1 items-center gap-2 font-mono text-[11px] text-krater">
                  <span className="h-px flex-1 bg-krater/40" />
                  <Upload size={14} strokeWidth={1.5} />
                  <span>ciphertext only</span>
                  <span className="h-px flex-1 bg-krater/40" />
                </div>
                <div className="rounded-md border border-stone-700 bg-stone-800 px-3 py-2 font-mono text-[11px] text-cream">
                  kraterion
                </div>
              </div>
              <div className="mt-6 rounded-md border border-stone-700 bg-stone-800 p-3 font-mono text-[11px] text-stone-300">
                <div className="text-stone-500">// what we see</div>
                <div>0x9c4a8b21f0e7c…</div>
                <div>0x4d2f0e9c7b81a…</div>
                <div>0x4f1ab3a0e7c2f…</div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-[11px] text-stone-400">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-krater" />
                no plaintext crosses the wire
              </div>
            </div>
          ),
        },
        {
          label: "3 · Store ciphertext",
          node: (
            <div className="h-full bg-stone-900 p-6 md:p-8">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-400">
                On our side
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Database size={24} strokeWidth={1.5} className="text-cream" />
                <span className="text-[20px] text-cream">bucket.assets-prod</span>
              </div>
              <div className="mt-6 space-y-2">
                {[
                  { name: "photo.jpg", state: "ciphertext" },
                  { name: "report.pdf", state: "ciphertext" },
                  { name: "audio.wav", state: "ciphertext" },
                ].map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between rounded-sm border border-stone-700 bg-stone-800/60 px-3 py-2 text-[12px]"
                  >
                    <span className="font-mono text-cream">{row.name}</span>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-stone-400">
                      <span className="h-1 w-1 rounded-full bg-krater" />
                      {row.state}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 font-mono text-[11px] text-stone-400">
                We hold the bytes; we can&apos;t read them.
              </div>
            </div>
          ),
        },
        {
          label: "4 · Decrypt on read",
          node: (
            <div className="h-full bg-stone-900 p-6 md:p-8">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-400">
                On your device again
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Key size={24} strokeWidth={1.5} className="text-krater" />
                <span className="text-[20px] text-cream">photo.jpg</span>
                <span className="text-[12px] text-stone-400">→ readable</span>
              </div>
              <div className="mt-6 grid grid-cols-8 gap-1.5">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-sm bg-stone-700"
                    style={{ opacity: 0.4 + (i % 8) * 0.075 }}
                  />
                ))}
              </div>
              <div className="mt-6 font-mono text-[11px] text-[color:var(--color-success)]">
                ✓ keys fetched · plaintext available locally
              </div>
              <div className="mt-1 font-mono text-[11px] text-stone-400">
                keys never touch our servers
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
