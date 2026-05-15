import type { Metadata } from "next";

/**
 * P6 — Embed widget layout group.
 *
 * Sibling to `(app)/`, so it inherits ONLY the root layout
 * (Providers + globals.css + font vars). No RequireAuth, no Sidebar,
 * no dashboard chrome. The customer's site frames this in an iframe;
 * the body fills the iframe viewport.
 *
 * Frame-ancestors is intentionally NOT pinned — the chat API enforces
 * per-token origin allowlisting on every call, which is the real gate.
 * Pinning `frame-ancestors` here would require us to know every
 * customer's origin at server-render time, which the share token
 * model is specifically designed to decouple from.
 */
export const metadata: Metadata = {
  title: "Kraterion chat",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        // Anchor to the iframe viewport. Width = whatever the iframe
        // is sized to by the loader script (we ship 380px desktop /
        // full-bleed mobile out of the box).
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
