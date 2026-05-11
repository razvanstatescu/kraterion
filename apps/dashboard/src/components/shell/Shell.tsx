import type { ReactNode } from "react";

interface Props {
  sidebar: ReactNode;
  children: ReactNode;
}

/**
 * Two-column app shell — sticky sidebar on the left, scrollable content
 * on the right. Children are expected to render their own `<Topbar>` +
 * `<main className="ks-screen">` pair so per-page topbars stay sticky
 * to the content column instead of the viewport.
 */
export function Shell({ sidebar, children }: Props) {
  return (
    <div className="ks-app">
      {sidebar}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>{children}</div>
    </div>
  );
}
