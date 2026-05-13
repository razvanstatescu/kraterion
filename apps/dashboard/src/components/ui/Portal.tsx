"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render children at `document.body` instead of in-tree.
 *
 * Every modal in the app uses `position: fixed` scrims and relies on
 * viewport-relative positioning. That breaks the moment a modal mounts
 * inside an ancestor that creates a containing block — most commonly the
 * Drawer panel, which keeps a `transform` applied after its slide-in
 * animation. CSS containing-block rules say: a `transform`d ancestor
 * pins `position: fixed` descendants to its box, not the viewport, so
 * the scrim shrinks to whatever element it's nested under.
 *
 * Portaling to `document.body` sidesteps the issue entirely — the modal
 * lives at the top of the DOM tree and the viewport is its containing
 * block again.
 *
 * SSR-safe: returns `null` on the server and on the first client render,
 * then upgrades to the portal once we have a real `document`. This
 * matches how Radix / Headless UI handle portals.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
