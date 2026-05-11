"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  tabs: string[];
  initial?: string;
  /** Maps each tab label to its code body. */
  children: (active: string) => ReactNode;
}

export function TabbedCode({ tabs, initial, children }: Props) {
  const [active, setActive] = useState(initial ?? tabs[0]);
  const [copied, setCopied] = useState(false);

  if (!active) return null;

  const onCopy = async () => {
    // Pull the rendered text from the pre element (the children render is
    // strings; navigator.clipboard handles it).
    const root = document.activeElement?.closest(".ks-tabcode");
    const pre = root?.querySelector("pre");
    const text = pre?.textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; silent for now.
    }
  };

  return (
    <div className="ks-tabcode">
      <div className="ks-tabcode-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={`ks-tabcode-tab ${t === active ? "is-active" : ""}`}
            onClick={() => setActive(t)}
          >
            {t}
          </button>
        ))}
        <button className="ks-tabcode-copy" onClick={onCopy} type="button">
          <Icon name="copy" size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="ks-codeblock"><pre>{children(active)}</pre></div>
    </div>
  );
}
