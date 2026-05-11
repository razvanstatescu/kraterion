"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastTone = "info" | "success" | "warning" | "error";

interface ToastInput {
  tone?: ToastTone;
  title: string;
  body?: ReactNode;
  /** Persist longer (8s) — useful when there's a "View on-chain" link. */
  sticky?: boolean;
}

interface ToastRecord extends ToastInput {
  id: number;
}

interface ToastApi {
  show: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<ToastRecord[]>([]);
  const counter = useRef(0);

  const show = useCallback((toast: ToastInput) => {
    counter.current += 1;
    const id = counter.current;
    setStack((prev) => [...prev, { ...toast, id }]);
    const ttl = toast.sticky ? 8000 : 4000;
    setTimeout(() => {
      setStack((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="ks-toast-stack" aria-live="polite">
        {stack.map((t) => (
          <div key={t.id} className="ks-toast">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{t.title}</div>
              {t.body ? <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{t.body}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
