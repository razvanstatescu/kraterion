"use client";

import { Button } from "@/components/ui/Button";
import { useSignOut } from "@/lib/auth";

export function SignOutButton() {
  const signOut = useSignOut();
  return (
    <Button variant="ghost" size="sm" icon="logOut" onClick={signOut}>
      Sign out
    </Button>
  );
}
