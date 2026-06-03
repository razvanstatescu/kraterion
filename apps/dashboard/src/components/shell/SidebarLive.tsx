"use client";

import { Sidebar } from "./Sidebar";
import { avatarInitial, useCpSession } from "@/lib/auth";
import { useMe, useOnboarding } from "@/lib/queries";

/**
 * Hydrate the static Sidebar shell with live session + `useMe()` data.
 *
 * Renders the shell even while `/v1/me` is loading — the sidebar's still
 * useful for nav-clicks. Falls back to the JWT-claim email if the query
 * hasn't returned yet.
 */
export function SidebarLive() {
  const { session } = useCpSession();
  const { data } = useMe();
  const { data: onboarding } = useOnboarding();
  const email = data?.account.email ?? session?.email;
  const projectName = data?.projects[0]?.name ?? "default";
  // Show the "Get started" sidebar shortcut whenever the inline card
  // has been dismissed so the user can resurface it for a demo or a
  // refresher. The card itself stays visible after all four steps are
  // complete (showing the "all set" state) — only dismissal hides it.
  const showGetStarted = onboarding?.dismissed_at !== null && onboarding != null;

  return (
    <Sidebar
      projectName={projectName}
      accountEmail={email}
      accountInitial={avatarInitial(email)}
      showGetStarted={showGetStarted}
    />
  );
}
