"use client";

import { useEffect, type ReactNode } from "react";
import { IconButton } from "./IconButton";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  width?: number;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, eyebrow, actions, width = 440, children }: Props) {
  // Close on Escape — matches the rest of the system's keyboard behavior.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ks-drawer-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="ks-drawer" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <header className="ks-drawer-head">
          <div>
            {eyebrow ? <div className="ks-drawer-eyebrow">{eyebrow}</div> : null}
            <div className="ks-drawer-title">{title}</div>
          </div>
          <IconButton name="x" label="Close" onClick={onClose} />
        </header>
        <div className="ks-drawer-body">{children}</div>
        {actions ? <footer className="ks-drawer-foot">{actions}</footer> : null}
      </aside>
    </div>
  );
}
