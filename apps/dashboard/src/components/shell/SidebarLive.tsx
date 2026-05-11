"use client";

import { Sidebar } from "./Sidebar";
import { avatarInitial, useCpSession } from "@/lib/auth";
import { useMe } from "@/lib/queries";

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
  const email = data?.account.email ?? session?.email;
  const projectName = data?.projects[0]?.name ?? "default";

  return (
    <Sidebar
      projectName={projectName}
      accountEmail={email}
      accountInitial={avatarInitial(email)}
    />
  );
}
